import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

export type ConfidenceActionType = "design" | "query" | "attachment_match";

const DEFAULT_THRESHOLDS: Record<ConfidenceActionType, number> = {
  design: 85,
  query: 85,
  attachment_match: 85,
};

/** Per-org override if one exists (Section 7's confidence system), else the platform default. */
export async function getConfidenceThreshold(
  admin: SupabaseClient<Database>,
  orgId: number,
  actionType: ConfidenceActionType
): Promise<number> {
  const { data } = await admin
    .from("confidence_thresholds")
    .select("threshold")
    .eq("org_id", orgId)
    .eq("action_type", actionType)
    .maybeSingle();

  return data?.threshold ?? DEFAULT_THRESHOLDS[actionType];
}
