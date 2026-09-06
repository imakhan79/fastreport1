import type { SupabaseClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import type { Database } from "../supabase/database.types";
import type { OrchestratorPlan } from "./orchestrator-schema";
import { bindComponent, type DesignComponent } from "./report-binding";
import { drawBarChart, drawLineChart, drawPieChart, type ChartPoint } from "./pdf-charts";

const EXPORT_BUCKET = "report-exports";

type Report = Database["public"]["Tables"]["reports"]["Row"];
type Design = Database["public"]["Tables"]["designs"]["Row"];
type Query = Database["public"]["Tables"]["queries"]["Row"];

export class ReportGenerationError extends Error {}

/**
 * Mirrors Section 16: the workflow only generates once every dependency
 * it actually needed has completed - not just "attempted". A design or
 * query still sitting in pending_review/failed, or an attachment still
 * outstanding, means the report isn't ready yet.
 */
export async function isReportReadyToGenerate(
  admin: SupabaseClient<Database>,
  report: Report,
  plan: OrchestratorPlan
): Promise<boolean> {
  if (plan.design.required) {
    const { data: design } = await admin
      .from("designs")
      .select("status")
      .eq("report_id", report.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!design || !["auto_approved", "approved"].includes(design.status)) return false;
  }

  if (plan.query.required) {
    const { data: query } = await admin
      .from("queries")
      .select("status")
      .eq("report_id", report.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!query || !["executed", "approved"].includes(query.status)) return false;
  }

  if (plan.attachments.required && plan.attachments.requirements.length > 0) {
    const { data: requirements } = await admin
      .from("attachment_requirements")
      .select("status")
      .eq("report_id", report.id);
    if (!requirements || requirements.some((r) => r.status !== "approved")) return false;
  }

  return true;
}

function renderPdf(report: Report, design: Design | null, query: Query | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(report.title ?? report.natural_language_request);
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .fillColor("#666666")
      .text(`Generated ${new Date().toLocaleString()} · confidence ${report.confidence_overall ?? "n/a"}%`);
    doc.fillColor("#000000");
    doc.moveDown(1);

    const rows = (query?.result_preview as Record<string, unknown>[] | undefined) ?? [];

    if (design) {
      const layout = design.layout as { sections: { id: string; title: string; order: number }[] };
      const components = design.components as DesignComponent[];
      const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftX = doc.page.margins.left;

      for (const section of [...layout.sections].sort((a, b) => a.order - b.order)) {
        doc.fontSize(14).text(section.title);
        doc.moveDown(0.3);
        const sectionComponents = components.filter((c) => c.section_id === section.id);
        doc.fontSize(10);

        for (const component of sectionComponents) {
          const bound = bindComponent(component, rows);

          if (!bound) {
            const kind = component.type === "chart" ? component.chart_type : component.type;
            doc.text(`• ${component.title} (${kind})`);
            continue;
          }

          if (bound.kind === "kpi") {
            doc.fontSize(9).fillColor("#666666").text(component.title);
            doc.fontSize(16).fillColor("#0f172a").text(bound.value);
            doc.fontSize(10).fillColor("#000000");
            doc.moveDown(0.4);
            continue;
          }

          // bound.kind === "series"
          doc.fontSize(10).text(component.title);
          doc.moveDown(0.15);

          if (component.type === "chart") {
            const chartHeight = 110;
            if (doc.y + chartHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();
            const chartX = leftX;
            const chartY = doc.y;
            const points: ChartPoint[] = bound.points;
            const ordered =
              component.chart_type === "line" ? points : [...points].sort((a, b) => b.value - a.value);

            if (component.chart_type === "line") drawLineChart(doc, chartX, chartY, usableWidth, chartHeight, ordered);
            else if (component.chart_type === "pie") drawPieChart(doc, chartX, chartY, usableWidth, chartHeight, ordered);
            else drawBarChart(doc, chartX, chartY, usableWidth, chartHeight, ordered.slice(0, 10));

            doc.y = chartY + chartHeight + 8;
          } else {
            // table component bound to a real series - a compact label/value table.
            doc.fontSize(8);
            const labelColWidth = usableWidth * 0.6;
            const valueColWidth = usableWidth - labelColWidth;
            const tableX = leftX;
            for (const point of bound.points.slice(0, 15)) {
              const rowY = doc.y;
              doc.text(point.label, tableX, rowY, { width: labelColWidth, lineBreak: false });
              doc.text(point.value.toLocaleString(), tableX + labelColWidth, rowY, {
                width: valueColWidth,
                align: "right",
                lineBreak: false,
              });
              doc.y = rowY + doc.currentLineHeight() + 2;
            }
            doc.fontSize(10);
          }

          doc.moveDown(0.5);
        }
        doc.moveDown(0.5);
      }
    }

    if (rows.length > 0) {
      doc.fontSize(14).text("Data");
      doc.moveDown(0.3);
      doc.font("Courier").fontSize(8);

      const columns = Object.keys(rows[0]);

      // Courier averages ~0.6x fontSize per character; size columns in
      // characters (not points) so the joined row actually fits one line.
      const usableWidthPt = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const maxChars = Math.floor(usableWidthPt / (8 * 0.6));
      const colWidth = Math.min(24, Math.max(8, Math.floor(maxChars / columns.length)));

      const printRow = (values: string[]) => {
        doc.text(values.map((v) => v.padEnd(colWidth).slice(0, colWidth)).join(""));
      };

      printRow(columns);
      doc.moveDown(0.1);
      for (const row of rows) {
        printRow(columns.map((c) => String(row[c] ?? "")));
      }
      doc.font("Helvetica");
    }

    doc.end();
  });
}

async function renderExcel(report: Report, design: Design | null, query: Query | null): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet("Summary");
  summary.addRow(["Report", report.title ?? report.natural_language_request]);
  summary.addRow(["Generated", new Date().toLocaleString()]);
  summary.addRow(["Confidence", report.confidence_overall ?? "n/a"]);
  summary.addRow([]);

  const rows = (query?.result_preview as Record<string, unknown>[] | undefined) ?? [];

  if (design) {
    const layout = design.layout as { sections: { id: string; title: string; order: number }[] };
    const components = design.components as DesignComponent[];

    for (const section of [...layout.sections].sort((a, b) => a.order - b.order)) {
      const sectionRow = summary.addRow([section.title]);
      sectionRow.font = { bold: true, size: 13 };

      for (const component of components.filter((c) => c.section_id === section.id)) {
        const bound = bindComponent(component, rows);

        if (!bound) {
          summary.addRow(["", component.title, component.type === "chart" ? component.chart_type : component.type]);
          continue;
        }

        if (bound.kind === "kpi") {
          const kpiRow = summary.addRow(["", component.title, bound.value]);
          kpiRow.getCell(3).font = { bold: true, size: 14 };
          continue;
        }

        const titleRow = summary.addRow(["", component.title]);
        titleRow.font = { bold: true };
        summary.addRow(["", bound.categoryLabel, bound.valueLabel]);
        const firstValueRow = summary.lastRow!.number + 1;
        for (const point of bound.points.slice(0, 15)) {
          summary.addRow(["", point.label, point.value]);
        }
        const lastValueRow = summary.lastRow!.number;

        if (component.type === "chart" && lastValueRow >= firstValueRow) {
          try {
            summary.addConditionalFormatting({
              ref: `C${firstValueRow}:C${lastValueRow}`,
              rules: [{ type: "dataBar", priority: 1, gradient: false, cfvo: [{ type: "min" }, { type: "max" }] }],
            });
          } catch {
            // Best-effort visual only - the numbers above are already real either way.
          }
        }
      }
      summary.addRow([]);
    }
  }

  if (rows.length > 0) {
    const dataSheet = workbook.addWorksheet("Data");
    dataSheet.addRow(Object.keys(rows[0]));
    for (const row of rows) {
      dataSheet.addRow(Object.values(row));
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function ensureExportBucket(admin: SupabaseClient<Database>) {
  const { error } = await admin.storage.createBucket(EXPORT_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw error;
}

/**
 * Section 16/19: generate -> export -> store -> (distribute, not built yet)
 * -> close the workflow. Only call this once isReportReadyToGenerate() is true.
 */
export async function generateAndExportReport(
  admin: SupabaseClient<Database>,
  report: Report,
  plan: OrchestratorPlan
): Promise<void> {
  const [{ data: design }, { data: query }] = await Promise.all([
    admin.from("designs").select("*").eq("report_id", report.id).order("id", { ascending: false }).limit(1).maybeSingle(),
    admin.from("queries").select("*").eq("report_id", report.id).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);

  await admin.from("reports").update({ status: "generating" }).eq("id", report.id);

  const wantedFormats = report.export_formats.length > 0 ? report.export_formats : ["pdf", "excel"];
  const wantPdf = wantedFormats.includes("pdf");
  const wantExcel = wantedFormats.includes("excel");

  let pdfBuffer: Buffer | null = null;
  let excelBuffer: Buffer | null = null;
  try {
    [pdfBuffer, excelBuffer] = await Promise.all([
      wantPdf ? renderPdf(report, design ?? null, query ?? null) : Promise.resolve(null),
      wantExcel ? renderExcel(report, design ?? null, query ?? null) : Promise.resolve(null),
    ]);
  } catch (error) {
    throw new ReportGenerationError(
      `Failed to render report: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  await admin.from("audit_log").insert({
    org_id: report.org_id,
    report_id: report.id,
    actor_type: "system",
    action: "report.generated",
    entity_type: "report",
    entity_id: report.id,
    details: {},
  });

  await admin.from("reports").update({ status: "exporting" }).eq("id", report.id);
  await ensureExportBucket(admin);

  const pdfPath = `${report.id}/report.pdf`;
  const excelPath = `${report.id}/report.xlsx`;

  const [pdfUpload, excelUpload] = await Promise.all([
    pdfBuffer
      ? admin.storage.from(EXPORT_BUCKET).upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true })
      : Promise.resolve({ error: null }),
    excelBuffer
      ? admin.storage.from(EXPORT_BUCKET).upload(excelPath, excelBuffer, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        })
      : Promise.resolve({ error: null }),
  ]);

  if (pdfUpload.error || excelUpload.error) {
    throw new ReportGenerationError(
      `Failed to store export: ${pdfUpload.error?.message ?? excelUpload.error?.message}`
    );
  }

  const exportRows = [
    ...(pdfBuffer ? [{ org_id: report.org_id, report_id: report.id, format: "pdf", storage_path: pdfPath }] : []),
    ...(excelBuffer ? [{ org_id: report.org_id, report_id: report.id, format: "excel", storage_path: excelPath }] : []),
  ];
  if (exportRows.length > 0) {
    await admin.from("report_exports").insert(exportRows);
  }

  await admin.from("audit_log").insert({
    org_id: report.org_id,
    report_id: report.id,
    actor_type: "system",
    action: "report.exported",
    entity_type: "report",
    entity_id: report.id,
    details: { pdf_path: pdfPath, excel_path: excelPath },
  });

  const finalStatus = plan.distribution.required ? "distributing" : "completed";
  await admin.from("reports").update({ status: finalStatus }).eq("id", report.id);

  await admin.from("audit_log").insert({
    org_id: report.org_id,
    report_id: report.id,
    actor_type: "system",
    action: finalStatus === "completed" ? "report.workflow_completed" : "report.awaiting_distribution",
    entity_type: "report",
    entity_id: report.id,
    details: {},
  });
}

/** Checks readiness and generates if ready; safe to call after any pipeline stage completes. */
export async function tryGenerateReport(
  admin: SupabaseClient<Database>,
  report: Report,
  plan: OrchestratorPlan
): Promise<boolean> {
  if (report.status !== "generating") return false;
  const ready = await isReportReadyToGenerate(admin, report, plan);
  if (!ready) return false;
  await generateAndExportReport(admin, report, plan);
  return true;
}
