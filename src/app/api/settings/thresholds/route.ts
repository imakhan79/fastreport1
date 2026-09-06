import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultOrgAndUser } from "@/lib/bootstrap";
import type { ConfidenceActionType } from "@/lib/ai/confidence";

const ACTION_TYPES: ConfidenceActionType[] = ["design", "query", "attachment_match"];

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const actionType = body?.actionType;
  const threshold = body?.threshold;

  if (!ACTION_TYPES.includes(actionType)) {
    return NextResponse.json({ error: `actionType must be one of: ${ACTION_TYPES.join(", ")}` }, { status: 400 });
  }
  if (typeof threshold !== "number" || threshold < 0 || threshold > 100) {
    return NextResponse.json({ error: "threshold must be a number between 0 and 100." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { orgId } = await ensureDefaultOrgAndUser();

  const { error } = await admin
    .from("confidence_thresholds")
    .upsert({ org_id: orgId, action_type: actionType, threshold }, { onConflict: "org_id,action_type" });

  if (error) {
    return NextResponse.json({ error: "Failed to update threshold." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
