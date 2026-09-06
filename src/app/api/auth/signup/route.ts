import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_ORG_NAME = "Default Organization";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const orgName = typeof body?.orgName === "string" && body.orgName.trim() ? body.orgName.trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError || !created.user) {
    const message = /already been registered|already exists/i.test(createUserError?.message ?? "")
      ? "An account with that email already exists."
      : "Could not create account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const userId = created.user.id;

  await admin.from("profiles").insert({ id: userId, full_name: null });

  // The very first person to ever sign up inherits the pre-seeded demo
  // organization (and its sample reports/schedules/connectors) as its
  // owner, instead of starting from an empty one. Everyone after that gets
  // their own fresh organization.
  const { data: defaultOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("name", DEFAULT_ORG_NAME)
    .maybeSingle();

  let defaultOrgIsUnclaimed = false;
  if (defaultOrg) {
    const { count } = await admin
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", defaultOrg.id);
    defaultOrgIsUnclaimed = (count ?? 0) === 0;
  }

  let orgId: number;
  if (defaultOrg && defaultOrgIsUnclaimed) {
    orgId = defaultOrg.id;
    if (orgName) await admin.from("organizations").update({ name: orgName }).eq("id", orgId);
  } else {
    const { data: newOrg, error: orgError } = await admin
      .from("organizations")
      .insert({ name: orgName ?? `${email}'s Organization` })
      .select("id")
      .single();
    if (orgError || !newOrg) {
      return NextResponse.json({ error: "Account created, but failed to set up an organization." }, { status: 500 });
    }
    orgId = newOrg.id;
  }

  const { error: memberError } = await admin
    .from("org_members")
    .insert({ org_id: orgId, user_id: userId, role: "owner" });

  if (memberError) {
    return NextResponse.json({ error: "Account created, but failed to join the organization." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
