import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { requestApprovalIfNeeded } from "./approval-pipeline";
import { tryGenerateReport } from "./report-generation";
import type { OrchestratorPlan } from "./orchestrator-schema";

/**
 * Single entry point for "something just changed - see if the report can
 * move forward." Safe to call after any pipeline stage or human decision:
 * it re-reads the current status and only acts on the stage it's actually
 * in, so it's a no-op everywhere else.
 */
export async function advanceReportWorkflow(
  admin: SupabaseClient<Database>,
  report: Database["public"]["Tables"]["reports"]["Row"],
  plan: OrchestratorPlan
): Promise<void> {
  const { data: fresh } = await admin.from("reports").select("*").eq("id", report.id).single();
  if (!fresh) return;

  if (fresh.status === "pending_approval") {
    await requestApprovalIfNeeded(admin, fresh);
  } else if (fresh.status === "generating") {
    await tryGenerateReport(admin, fresh, plan);
  }
}
