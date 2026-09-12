"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  CaretDown,
  CaretUp,
  CaretUpDown,
  CircleNotch,
  FileCsv,
  FilePdf,
  FileXls,
  MagnifyingGlass,
  Printer,
  WarningCircle,
} from "@phosphor-icons/react";

type SalesReportRow = {
  sales_year: number;
  quarter: string;
  category_name: string;
  total_orders: number;
  total_units_sold: number;
  net_sales_revenue: number;
};

type SortKey = keyof SalesReportRow;
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 10;

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "sales_year", label: "Sales Year", align: "left" },
  { key: "quarter", label: "Quarter", align: "left" },
  { key: "category_name", label: "Category Name", align: "left" },
  { key: "total_orders", label: "Total Orders", align: "right" },
  { key: "total_units_sold", label: "Total Units Sold", align: "right" },
  { key: "net_sales_revenue", label: "Net Sales Revenue", align: "right" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2, 0, 1);
  return d.toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SalesReportPage() {
  const [fromDate, setFromDate] = useState(defaultFromIso());
  const [toDate, setToDate] = useState(todayIso());
  const [rows, setRows] = useState<SalesReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("sales_year");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const generateReport = useCallback(async (from: string, to: string) => {
    if (from && to && from > to) {
      setError("'From Date' must be on or before 'To Date'.");
      return;
    }
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/sales-report?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to generate the sales report.");
      }
      setRows(data?.rows ?? []);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate the sales report.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => generateReport(defaultFromIso(), todayIso()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleReset() {
    const from = defaultFromIso();
    const to = todayIso();
    setFromDate(from);
    setToDate(to);
    generateReport(from, to);
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function handleExport(format: "csv" | "excel" | "pdf") {
    setExporting(format);
    try {
      const params = new URLSearchParams({ format });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/sales-report/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed.");
      const blob = await res.blob();
      const ext = format === "excel" ? "xlsx" : format;
      downloadBlob(blob, `sales-report_${fromDate || "start"}_to_${toDate || "today"}.${ext}`);
    } catch {
      setError(`Could not export the report as ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 print:max-w-none print:px-0 print:py-0">
      {/* Report header */}
      <div className="rounded-lg border border-[var(--color-border)] bg-card shadow-sm print:border-0 print:shadow-none">
        <div className="border-b border-[var(--color-border)] px-6 py-6 print:border-b-2 print:border-black">
          <span className="inline-block rounded-full border border-[var(--color-border)] bg-muted px-3 py-1 text-[11px] font-semibold tracking-wide text-primary print:hidden">
            SALES REPORT
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Basic Systems Engineering
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground sm:text-base">Sales Report Quarter Wise</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 border-b border-[var(--color-border)] px-6 py-5 print:hidden">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold text-foreground">From Date</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-md border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold text-foreground">To Date</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-md border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>

            <div className="flex items-center gap-2 pb-0.5">
              <button
                onClick={() => generateReport(fromDate, toDate)}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <CircleNotch size={15} weight="bold" className="animate-spin" />
                ) : (
                  <MagnifyingGlass size={15} weight="bold" />
                )}
                Generate Report
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowCounterClockwise size={15} weight="bold" />
                Reset Filters
              </button>
            </div>
          </div>

          {/* Export / print toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-4">
            <span className="mr-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Actions</span>
            <ToolbarButton
              icon={<Printer size={14} weight="bold" />}
              label="Print Report"
              onClick={() => window.print()}
              disabled={loading || rows.length === 0}
            />
            <ToolbarButton
              icon={<FileXls size={14} weight="bold" />}
              label="Export to Excel"
              onClick={() => handleExport("excel")}
              disabled={loading || rows.length === 0}
              busy={exporting === "excel"}
            />
            <ToolbarButton
              icon={<FileCsv size={14} weight="bold" />}
              label="Export to CSV"
              onClick={() => handleExport("csv")}
              disabled={loading || rows.length === 0}
              busy={exporting === "csv"}
            />
            <ToolbarButton
              icon={<FilePdf size={14} weight="bold" />}
              label="Export to PDF"
              onClick={() => handleExport("pdf")}
              disabled={loading || rows.length === 0}
              busy={exporting === "pdf"}
            />
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
            <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Table */}
        <div className="px-6 py-6">
          <div className="overflow-x-auto rounded-md border border-[var(--color-border)] print:overflow-visible print:rounded-none print:border-black">
            <table className="w-full min-w-[720px] border-collapse text-sm print:min-w-0">
              <thead>
                <tr className="bg-muted print:bg-transparent">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className={`border-b-2 border-[var(--color-border)] px-4 py-3 text-xs font-bold tracking-wide text-foreground uppercase select-none print:border-black ${
                        col.align === "right" ? "text-right" : "text-left"
                      } cursor-pointer transition-colors hover:bg-black/5 print:cursor-default print:hover:bg-transparent`}
                    >
                      <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                        {col.label}
                        <SortIcon active={sortKey === col.key} direction={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <CircleNotch size={16} weight="bold" className="animate-spin" />
                        Generating report...
                      </span>
                    </td>
                  </tr>
                )}

                {!loading && hasSearched && sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No data found for the selected date range.
                    </td>
                  </tr>
                )}

                {!loading &&
                  pageRows.map((row, i) => (
                    <tr
                      key={`${row.sales_year}-${row.quarter}-${row.category_name}-${i}`}
                      className="border-b border-[var(--color-border)] transition-colors odd:bg-transparent even:bg-muted/40 hover:bg-primary/5 print:border-black print:hover:bg-transparent"
                    >
                      <td className="px-4 py-2.5 text-foreground">{row.sales_year}</td>
                      <td className="px-4 py-2.5 text-foreground">{row.quarter}</td>
                      <td className="px-4 py-2.5 text-foreground">{row.category_name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {numberFormatter.format(row.total_orders)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {numberFormatter.format(row.total_units_sold)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
                        {currencyFormatter.format(row.net_sales_revenue)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && sortedRows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground print:hidden">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}
                &ndash;{Math.min(currentPage * PAGE_SIZE, sortedRows.length)} of {sortedRows.length} record
                {sortedRows.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <CaretUpDown size={12} weight="bold" className="text-muted-foreground/60 print:hidden" />;
  return direction === "asc" ? (
    <CaretUp size={12} weight="bold" className="text-primary print:hidden" />
  ) : (
    <CaretDown size={12} weight="bold" className="text-primary print:hidden" />
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <CircleNotch size={13} weight="bold" className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
