import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { runBuilderQuery, ReportBuilderError, type BuilderConfig } from "@/lib/report-builder";
import { QueryExecutionError, ConnectionError } from "@/lib/ai/query-executor";

const EXPORT_LIMIT = 5000;
const FORMATS = ["csv", "excel", "pdf"] as const;
type Format = (typeof FORMATS)[number];

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const lines = [columns.map(csvEscape).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvEscape(row[c])).join(","));
  return lines.join("\r\n");
}

async function renderExcel(rows: Record<string, unknown>[], name: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(name.slice(0, 31) || "Report");
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  sheet.columns = columns.map((c) => ({ header: c, key: c, width: 18 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function renderPdf(rows: Record<string, unknown>[], name: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(name || "Report");
    doc.fontSize(9).fillColor("#475569").text(`Generated ${new Date().toLocaleString()}`);
    doc.fillColor("#000000");
    doc.moveDown(1);

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    if (columns.length === 0) {
      doc.fontSize(10).text("No data found.");
      doc.end();
      return;
    }

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / columns.length;
    const startX = doc.page.margins.left;
    let y = doc.y;
    const rowHeight = 20;

    function drawRow(cells: string[], bold: boolean, bg?: string) {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      if (bg) {
        doc.rect(startX, y, usableWidth, rowHeight).fill(bg);
        doc.fillColor("#000000");
      }
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      cells.forEach((cell, i) => {
        doc.text(cell, startX + i * colWidth + 4, y + 6, { width: colWidth - 8 });
      });
      doc.rect(startX, y, usableWidth, rowHeight).strokeColor("#cbd5e1").stroke();
      y += rowHeight;
    }

    drawRow(columns, true, "#e2e8f0");
    for (const row of rows) drawRow(columns.map((c) => String(row[c] ?? "")), false);

    doc.end();
  });
}

export async function POST(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await req.json().catch(() => null);
  const dataSourceId = Number(body?.dataSourceId);
  const table = typeof body?.table === "string" ? body.table : "";
  const config = body?.config as BuilderConfig | undefined;
  const format = body?.format as Format;
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : table;

  if (!Number.isInteger(dataSourceId) || !table || !config || !FORMATS.includes(format)) {
    return NextResponse.json({ error: "Missing or invalid dataSourceId, table, config, or format." }, { status: 400 });
  }

  let rows: Record<string, unknown>[];
  try {
    const result = await runBuilderQuery(createAdminClient(), orgId, dataSourceId, table, config, EXPORT_LIMIT);
    rows = result.rows;
  } catch (error) {
    if (error instanceof ReportBuilderError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ConnectionError) return NextResponse.json({ error: `Connection failed: ${error.message}` }, { status: 400 });
    if (error instanceof QueryExecutionError) return NextResponse.json({ error: `Query failed: ${error.message}` }, { status: 400 });
    console.error("report-builder export failed:", error);
    return NextResponse.json({ error: "Unexpected error running the query." }, { status: 500 });
  }

  const fileBase = name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "report";

  if (format === "csv") {
    return new NextResponse(rowsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  if (format === "excel") {
    const buffer = await renderExcel(rows, name);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  }

  const buffer = await renderPdf(rows, name);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
    },
  });
}
