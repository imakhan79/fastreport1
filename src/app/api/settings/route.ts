import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultOrgAndUser } from "@/lib/bootstrap";
import type { ConfidenceActionType } from "@/lib/ai/confidence";

const ACTION_TYPES: ConfidenceActionType[] = ["design", "query", "attachment_match"];
const DEFAULT_THRESHOLDS: Record<ConfidenceActionType, number> = {
  design: 85,
  query: 85,
  attachment_match: 85,
};

export async function GET() {
  const admin = createAdminClient();
  const { orgId } = await ensureDefaultOrgAndUser();

  const [{ data: organization }, { data: thresholdRows }, { data: memberRows }] = await Promise.all([
    admin.from("organizations").select("id, name, default_distribution_email, created_at").eq("id", orgId).single(),
    admin.from("confidence_thresholds").select("action_type, threshold").eq("org_id", orgId),
    admin.from("org_members").select("user_id, role, created_at").eq("org_id", orgId).order("created_at"),
  ]);

  const thresholdByType = new Map((thresholdRows ?? []).map((t) => [t.action_type, t.threshold]));
  const thresholds = ACTION_TYPES.map((type) => ({
    actionType: type,
    threshold: thresholdByType.get(type) ?? DEFAULT_THRESHOLDS[type],
  }));

  const { data: userList } = await admin.auth.admin.listUsers();
  const emailByUserId = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const members = (memberRows ?? []).map((m) => ({
    userId: m.user_id,
    email: emailByUserId.get(m.user_id) ?? null,
    role: m.role,
    joinedAt: m.created_at,
  }));

  return NextResponse.json({ organization, thresholds, members });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const admin = createAdminClient();
  const { orgId } = await ensureDefaultOrgAndUser();

  const update: { name?: string; default_distribution_email?: string | null } = {};

  if (body?.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "name must be a non-empty string." }, { status: 400 });
    }
    update.name = body.name.trim();
  }

  if (body?.defaultDistributionEmail !== undefined) {
    const raw = body.defaultDistributionEmail;
    if (raw !== null && typeof raw !== "string") {
      return NextResponse.json({ error: "defaultDistributionEmail must be a string or null." }, { status: 400 });
    }
    const trimmed = typeof raw === "string" ? raw.trim() : raw;
    update.default_distribution_email = trimmed || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { error } = await admin.from("organizations").update(update).eq("id", orgId);
  if (error) {
    return NextResponse.json({ error: "Failed to update organization." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
