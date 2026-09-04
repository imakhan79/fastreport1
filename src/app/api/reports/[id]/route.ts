import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: report, error } = await admin.from("reports").select("*").eq("id", reportId).single();
  if (error || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const [{ data: design }, { data: query }, { data: attachmentRequirements }, { data: exports }] = await Promise.all([
    admin.from("designs").select("*").eq("report_id", reportId).order("id", { ascending: false }).limit(1).maybeSingle(),
    admin.from("queries").select("*").eq("report_id", reportId).order("id", { ascending: false }).limit(1).maybeSingle(),
    admin.from("attachment_requirements").select("*").eq("report_id", reportId),
    admin.from("report_exports").select("*").eq("report_id", reportId),
  ]);

  const exportsWithUrls = await Promise.all(
    (exports ?? []).map(async (exp) => {
      if (!exp.storage_path) return { ...exp, url: null };
      const { data } = await admin.storage.from("report-exports").createSignedUrl(exp.storage_path, 3600);
      return { ...exp, url: data?.signedUrl ?? null };
    })
  );

  return NextResponse.json({
    report,
    design,
    query,
    attachmentRequirements: attachmentRequirements ?? [],
    exports: exportsWithUrls,
  });
}
