import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { processAttachmentUpload, AttachmentPipelineError } from "@/lib/ai/attachment-pipeline";

const BUCKET = "attachments";

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { error } = await admin.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const requirementIdRaw = formData?.get("requirementId");

  if (!(file instanceof File) || typeof requirementIdRaw !== "string") {
    return NextResponse.json({ error: "Missing 'file' or 'requirementId'." }, { status: 400 });
  }

  const requirementId = Number(requirementIdRaw);
  if (!Number.isInteger(requirementId)) {
    return NextResponse.json({ error: "Invalid requirementId." }, { status: 400 });
  }

  let userId: string, orgId: number;
  try {
    ({ userId, orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const admin = createAdminClient();
  await ensureBucket(admin);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const storagePath = `${requirementId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
  }

  try {
    const result = await processAttachmentUpload(
      admin,
      requirementId,
      buffer,
      file.type || "application/octet-stream",
      storagePath,
      userId,
      orgId
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof AttachmentPipelineError ? error.message : "Attachment processing failed unexpectedly.";
    console.error("Attachment pipeline failure:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
