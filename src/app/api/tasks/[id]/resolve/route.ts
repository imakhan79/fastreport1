import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultOrgAndUser } from "@/lib/bootstrap";
import { resolveTask, TaskResolutionError } from "@/lib/ai/task-resolution";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) {
    return NextResponse.json({ error: "Invalid task id." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { userId } = await ensureDefaultOrgAndUser();

  try {
    await resolveTask(admin, taskId, decision, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof TaskResolutionError ? error.message : "Failed to resolve task.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
