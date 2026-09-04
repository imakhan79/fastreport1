import { createAdminClient } from "./supabase/admin";

const DEFAULT_ORG_NAME = "Default Organization";
const SYSTEM_USER_EMAIL = "system@fastreport.local";

/**
 * Temporary stand-in for real auth/org onboarding: finds or creates one
 * organization and one member to attribute automatically-created reports
 * to, until sign-up/login exists. Idempotent - safe to call on every request.
 */
export async function ensureDefaultOrgAndUser(): Promise<{
  orgId: number;
  userId: string;
}> {
  const admin = createAdminClient();

  const { data: existingOrg, error: orgLookupError } = await admin
    .from("organizations")
    .select("id")
    .eq("name", DEFAULT_ORG_NAME)
    .maybeSingle();
  if (orgLookupError) throw orgLookupError;

  let orgId = existingOrg?.id as number | undefined;
  if (!orgId) {
    const { data: newOrg, error: orgInsertError } = await admin
      .from("organizations")
      .insert({ name: DEFAULT_ORG_NAME })
      .select("id")
      .single();
    if (orgInsertError) throw orgInsertError;
    orgId = newOrg.id as number;
  }

  const { data: userList, error: userListError } = await admin.auth.admin.listUsers();
  if (userListError) throw userListError;

  let userId = userList.users.find((u) => u.email === SYSTEM_USER_EMAIL)?.id;
  if (!userId) {
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: SYSTEM_USER_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: "DataReportQ System" },
    });
    if (createUserError) throw createUserError;
    userId = createdUser.user.id;
  }

  const { data: membership, error: membershipLookupError } = await admin
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipLookupError) throw membershipLookupError;

  if (!membership) {
    const { error: membershipInsertError } = await admin.from("org_members").insert({
      org_id: orgId,
      user_id: userId,
      role: "owner",
    });
    if (membershipInsertError) throw membershipInsertError;
  }

  return { orgId, userId };
}
