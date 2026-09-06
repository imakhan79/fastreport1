import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";

export class UnauthorizedError extends Error {}

/**
 * Replaces the old ensureDefaultOrgAndUser() stand-in: resolves the actual
 * signed-in user (via a server-side getUser() call, which revalidates the
 * JWT against Supabase Auth rather than trusting a local cookie) and their
 * org membership. Every API route calls this instead of trusting a
 * hardcoded org/user - throws UnauthorizedError when there's no session or
 * no membership, which route handlers turn into a 401.
 */
export async function getAuthContext(): Promise<{ userId: string; orgId: number; email: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError("Not signed in.");
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    throw new UnauthorizedError("Signed in, but not a member of any organization.");
  }

  return { userId: user.id, orgId: membership.org_id, email: user.email ?? null };
}
