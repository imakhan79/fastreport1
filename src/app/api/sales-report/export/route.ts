import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { fetchSalesReportRows, formatCurrency, rowsToCsv, SALES_REPORT_COLUMNS, type SalesReportRow } from "@/lib/sales-report";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FORMATS = ["csv", "excel", "pdf"] as const;
type Format = (typeof FORMATS)[number];

function fileNameFor(format: Format, from: string | null, to: string | null): string {
  const range = from || to ? `_${from ?? "start"}_to_${to ?? "today"}` : "";
  const ext = format === "excel" ? "xlsx" : format;
  return `sales-report${range}.${ext}`;
}

async function renderExcel(rows: SalesReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sales Report");

  sheet.columns = [
    { header: "Sales Year", key: "sales_year", width: 12 },
    { header: "Quarter", key: "quarter", width: 10 },
    { header: "Category Name", key: "category_name", width: 22 },
    { header: "Total Orders", key: "total_orders", width: 14 },
    { header: "Total Units Sold", key: "total_units_sold", width: 16 },
    { header: "Net Sales Revenue", key: "net_sales_revenue", width: 18 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: "left" };

  for (const row of rows) {
    sheet.addRow(row);
  }

  for (const key of ["total_orders", "total_units_sold", "net_sales_revenue"]) {
    sheet.getColumn(key).alignment = { horizontal: "right" };
  }
  sheet.getColumn("net_sales_revenue").numFmt = "$#,##0";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function renderPdf(rows: SalesReportRow[], from: string | null, to: string | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Basic Systems Engineering", { continued: false });
    doc.fontSize(12).fillColor("#475569").text("Sales Report Quarter Wise");
    doc.fontSize(9).text(`Range: ${from ?? "All"} to ${to ?? "All"}  ·  Generated ${new Date().toLocaleString()}`);
    doc.fillColor("#000000");
    doc.moveDown(1);

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const widths = [0.13, 0.1, 0.24, 0.17, 0.18, 0.18].map((f) => f * usableWidth);
    const startX = doc.page.margins.left;
    let y = doc.y;
    const rowHeight = 20;

    function drawRow(cells: string[], opts: { bold?: boolean; bg?: string } = {}) {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      if (opts.bg) {
        doc.rect(startX, y, usableWidth, rowHeight).fill(opts.bg);
        doc.fillColor("#000000");
      }
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      let x = startX;
      cells.forEach((cell, i) => {
        const align = i >= 3 ? "right" : "left";
        doc.text(cell, x + 4, y + 6, { width: widths[i] - 8, align });
        x += widths[i];
      });
      doc.rect(startX, y, usableWidth, rowHeight).strokeColor("#cbd5e1").stroke();
      y += rowHeight;
    }

    drawRow([...SALES_REPORT_COLUMNS], { bold: true, bg: "#e2e8f0" });

    if (rows.length === 0) {
      doc.font("Helvetica").fontSize(10).text("No data found for the selected date range.", startX, y + 10);
    } else {
      rows.forEach((row) => {
        drawRow([
          String(row.sales_year),
          row.quarter,
          row.category_name,
          row.total_orders.toLocaleString("en-US"),
          row.total_units_sold.toLocaleString("en-US"),
          formatCurrency(row.net_sales_revenue),
        ]);
      });
    }

    doc.end();
  });
}

export async function GET(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const formatParam = searchParams.get("format");

  if (fromParam && !DATE_PATTERN.test(fromParam)) {
    return NextResponse.json({ error: "'from' must be a yyyy-mm-dd date." }, { status: 400 });
  }
  if (toParam && !DATE_PATTERN.test(toParam)) {
    return NextResponse.json({ error: "'to' must be a yyyy-mm-dd date." }, { status: 400 });
  }
  if (!formatParam || !FORMATS.includes(formatParam as Format)) {
    return NextResponse.json({ error: "'format' must be one of csv, excel, pdf." }, { status: 400 });
  }
  const format = formatParam as Format;

  const admin = createAdminClient();
  let rows;
  try {
    rows = await fetchSalesReportRows(admin, orgId, fromParam, toParam);
  } catch {
    return NextResponse.json({ error: "Failed to generate the sales report." }, { status: 500 });
  }

  const fileName = fileNameFor(format, fromParam, toParam);

  if (format === "csv") {
    return new NextResponse(rowsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  }

  if (format === "excel") {
    const buffer = await renderExcel(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  }

  const buffer = await renderPdf(rows, fromParam, toParam);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
