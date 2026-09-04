import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

/**
 * No skill/workload routing built yet - picks the org's owner (falling
 * back to any member) as the responsible party for any human task.
 */
export async function pickResponsibleUser(
  admin: SupabaseClient<Database>,
  orgId: number
): Promise<string | null> {
  const { data: owner } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (owner) return owner.user_id;

  const { data: anyMember } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  return anyMember?.user_id ?? null;
}
