import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultOrgAndUser } from "@/lib/bootstrap";
import { computeInitialNextRun, validateScheduleInput, ScheduleInputError } from "@/lib/ai/schedule";

export async function GET() {
  const admin = createAdminClient();
  const { orgId } = await ensureDefaultOrgAndUser();

  const { data: schedules, error } = await admin
    .from("report_schedules")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load schedules." }, { status: 500 });
  }

  return NextResponse.json({ schedules });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const request = body?.request;
  const frequency = body?.frequency;
  const dayOfWeek = body?.dayOfWeek ?? null;
  const dayOfMonth = body?.dayOfMonth ?? null;
  const hourUtc = body?.hourUtc ?? 9;
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null;

  if (typeof request !== "string" || request.trim().length === 0) {
    return NextResponse.json({ error: "Missing 'request' string." }, { status: 400 });
  }

  try {
    validateScheduleInput({ frequency, dayOfWeek, dayOfMonth, hourUtc });
  } catch (error) {
    const message = error instanceof ScheduleInputError ? error.message : "Invalid schedule.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { orgId, userId } = await ensureDefaultOrgAndUser();

  const nextRunAt = computeInitialNextRun({ frequency, dayOfWeek, dayOfMonth, hourUtc }, new Date());

  const { data: schedule, error: insertError } = await admin
    .from("report_schedules")
    .insert({
      org_id: orgId,
      created_by: userId,
      title,
      natural_language_request: request,
      frequency,
      day_of_week: dayOfWeek,
      day_of_month: dayOfMonth,
      hour_utc: hourUtc,
      next_run_at: nextRunAt.toISOString(),
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to save schedule." }, { status: 500 });
  }

  return NextResponse.json({ schedule });
}
