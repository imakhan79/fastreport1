import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { requestApprovalIfNeeded } from "./approval-pipeline";
import { tryGenerateReport } from "./report-generation";
import { distributeReport, DistributionError } from "./distribution";
import type { OrchestratorPlan } from "./orchestrator-schema";

type Report = Database["public"]["Tables"]["reports"]["Row"];

async function fetchReport(admin: SupabaseClient<Database>, id: number): Promise<Report | null> {
  const { data } = await admin.from("reports").select("*").eq("id", id).single();
  return data ?? null;
}

/**
 * Single entry point for "something just changed - see if the report can
 * move forward." Safe to call after any pipeline stage or human decision:
 * it re-reads the current status and only acts on the stage it's actually
 * in, chaining straight through generation -> distribution when both are
 * ready in the same call, so a report doesn't wait for a second trigger
 * just to send an email it was already ready to send.
 */
export async function advanceReportWorkflow(
  admin: SupabaseClient<Database>,
  report: Report,
  plan: OrchestratorPlan
): Promise<void> {
  let current = await fetchReport(admin, report.id);
  if (!current) return;

  if (current.status === "pending_approval") {
    await requestApprovalIfNeeded(admin, current);
    return;
  }

  if (current.status === "generating") {
    await tryGenerateReport(admin, current, plan);
    current = (await fetchReport(admin, report.id)) ?? current;
  }

  if (current.status === "distributing") {
    try {
      await distributeReport(admin, current, plan);
    } catch (error) {
      if (!(error instanceof DistributionError)) throw error;
      console.error("Distribution failed:", error.message);
    }
  }
}
