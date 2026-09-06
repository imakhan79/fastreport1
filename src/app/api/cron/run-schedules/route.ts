import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReportPipeline, ReportPipelineError } from "@/lib/ai/run-report-pipeline";
import { advanceNextRun } from "@/lib/ai/schedule";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Triggered by Vercel Cron (see vercel.json). Runs every due schedule's
 * saved request through the same pipeline as a manual /api/reports POST,
 * then advances next_run_at from the run it just fired (not from "now"),
 * so a delayed cron tick can't drift or double-fire a period.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: due, error } = await admin
    .from("report_schedules")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", now.toISOString());

  if (error) {
    return NextResponse.json({ error: "Failed to load due schedules." }, { status: 500 });
  }

  const results = [];
  for (const schedule of due ?? []) {
    const runAt = new Date(schedule.next_run_at);
    try {
      const result = await runReportPipeline(
        admin,
        schedule.org_id,
        schedule.created_by,
        schedule.natural_language_request
      );

      const nextRunAt = advanceNextRun(
        {
          frequency: schedule.frequency as "daily" | "weekly" | "monthly",
          dayOfWeek: schedule.day_of_week,
          dayOfMonth: schedule.day_of_month,
          hourUtc: schedule.hour_utc,
        },
        runAt
      );

      await admin
        .from("report_schedules")
        .update({
          last_run_at: now.toISOString(),
          last_report_id: result.report.id,
          next_run_at: nextRunAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", schedule.id);

      await admin.from("audit_log").insert({
        org_id: schedule.org_id,
        report_id: result.report.id,
        actor_type: "system",
        action: "schedule.run_completed",
        entity_type: "report_schedule",
        entity_id: schedule.id,
        details: { scheduleId: schedule.id, reportId: result.report.id },
      });

      results.push({ scheduleId: schedule.id, ok: true, reportId: result.report.id });
    } catch (error) {
      const nextRunAt = advanceNextRun(
        {
          frequency: schedule.frequency as "daily" | "weekly" | "monthly",
          dayOfWeek: schedule.day_of_week,
          dayOfMonth: schedule.day_of_month,
          hourUtc: schedule.hour_utc,
        },
        runAt
      );
      const message = error instanceof ReportPipelineError ? error.message : "Schedule run failed unexpectedly.";

      await admin
        .from("report_schedules")
        .update({ last_run_at: now.toISOString(), next_run_at: nextRunAt.toISOString(), updated_at: now.toISOString() })
        .eq("id", schedule.id);

      await admin.from("audit_log").insert({
        org_id: schedule.org_id,
        actor_type: "system",
        action: "schedule.run_failed",
        entity_type: "report_schedule",
        entity_id: schedule.id,
        details: { scheduleId: schedule.id, error: message },
      });

      results.push({ scheduleId: schedule.id, ok: false, error: message });
    }
  }

  return NextResponse.json({ ranAt: now.toISOString(), count: results.length, results });
}
