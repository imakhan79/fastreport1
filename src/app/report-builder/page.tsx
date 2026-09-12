"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Table as TableIcon,
  ChartBar,
  Plus,
  FloppyDisk,
  Trash,
  CircleNotch,
  WarningCircle,
  Play,
  FileCsv,
  FileXls,
  FilePdf,
  Database,
} from "@phosphor-icons/react";
import { fadeIn, Card, CardHeader, Alert } from "@/components/report-blocks";
import { DataSourcePicker, BuilderConfigEditor } from "@/components/report-config-editor";
import { BarChartSVG, LineChartSVG, PieChartSVG, type ChartDatum } from "@/components/report-builder-charts";
import {
  emptyBuilderConfig,
  valueKeyFor,
  REPORT_BUILDER_PRELOAD_KEY,
  type BuilderConfig,
  type DataSourceSummary,
  type IntrospectedTable,
} from "@/lib/report-builder-types";

type SavedReport = {
  id: number;
  name: string;
  table_name: string;
  data_source_id: number | null;
  config: BuilderConfig;
  updated_at: string;
};

export default function ReportBuilderPage() {
  const [dataSources, setDataSources] = useState<DataSourceSummary[]>([]);
  const [dataSourceId, setDataSourceId] = useState<number | null>(null);
  const [tables, setTables] = useState<IntrospectedTable[]>([]);
  const [tableName, setTableName] = useState<string | null>(null);
  const [config, setConfig] = useState<BuilderConfig>(emptyBuilderConfig());

  const [schemaLoading, setSchemaLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewSql, setPreviewSql] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRunPreview, setHasRunPreview] = useState(false);

  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [currentSavedId, setCurrentSavedId] = useState<number | null>(null);
  const [reportName, setReportName] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const loadSchema = useCallback(async (id: number) => {
    setSchemaLoading(true);
    try {
      const res = await fetch(`/api/report-builder/schema?dataSourceId=${id}`);
      const data = await res.json();
      if (res.ok) setTables(data.tables ?? []);
      else setError(data.error ?? "Could not load that data source's schema.");
    } catch {
      setError("Network error loading schema.");
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  const loadDataSources = useCallback(async () => {
    const res = await fetch("/api/data-sources");
    if (!res.ok) return;
    const data = await res.json();
    setDataSources(data.dataSources ?? []);
  }, []);

  const loadSavedReports = useCallback(async () => {
    setSavedLoading(true);
    const res = await fetch("/api/report-builder");
    if (res.ok) {
      const data = await res.json();
      setSavedReports(data.reports ?? []);
    }
    setSavedLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      void loadDataSources();
      void loadSavedReports();

      const raw = sessionStorage.getItem(REPORT_BUILDER_PRELOAD_KEY);
      if (!raw) return;
      sessionStorage.removeItem(REPORT_BUILDER_PRELOAD_KEY);
      try {
        const preload = JSON.parse(raw) as { dataSourceId: number; table: string; config: BuilderConfig; name?: string };
        setDataSourceId(preload.dataSourceId);
        setTableName(preload.table);
        setConfig(preload.config);
        setReportName(preload.name ?? "");
        await loadSchema(preload.dataSourceId);
      } catch {
        // Malformed handoff payload - ignore and start fresh.
      }
    });
  }, [loadDataSources, loadSavedReports, loadSchema]);

  const selectedTable = useMemo(() => tables.find((t) => t.name === tableName) ?? null, [tables, tableName]);

  async function handleDataSourceChange(id: number) {
    setDataSourceId(id);
    setTableName(null);
    setTables([]);
    setConfig(emptyBuilderConfig());
    setPreviewRows([]);
    setHasRunPreview(false);
    setError(null);
    await loadSchema(id);
  }

  function handleTableChange(name: string) {
    setTableName(name);
    setConfig(emptyBuilderConfig());
    setPreviewRows([]);
    setHasRunPreview(false);
  }

  async function runPreview() {
    if (!dataSourceId || !tableName) return;
    setPreviewLoading(true);
    setError(null);
    setHasRunPreview(true);
    try {
      const res = await fetch("/api/report-builder/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId, table: tableName, config }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to run the query.");
        setPreviewRows([]);
        setPreviewSql(null);
      } else {
        setPreviewRows(data.rows ?? []);
        setPreviewSql(data.sql ?? null);
      }
    } catch {
      setError("Network error running the query.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSave() {
    if (!dataSourceId || !tableName || !reportName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const method = currentSavedId ? "PUT" : "POST";
      const url = currentSavedId ? `/api/report-builder/${currentSavedId}` : "/api/report-builder";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: reportName.trim(), dataSourceId, table: tableName, config }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save the report.");
      } else {
        setCurrentSavedId(data.report.id);
        void loadSavedReports();
      }
    } catch {
      setError("Network error saving the report.");
    } finally {
      setSaving(false);
    }
  }

  async function loadSaved(report: SavedReport) {
    setError(null);
    setCurrentSavedId(report.id);
    setReportName(report.name);
    setConfig(report.config);
    setHasRunPreview(false);
    setPreviewRows([]);
    if (report.data_source_id && report.data_source_id !== dataSourceId) {
      setDataSourceId(report.data_source_id);
      await loadSchema(report.data_source_id);
    }
    setTableName(report.table_name);
  }

  async function deleteSaved(id: number) {
    await fetch(`/api/report-builder/${id}`, { method: "DELETE" });
    if (currentSavedId === id) {
      setCurrentSavedId(null);
      setReportName("");
    }
    void loadSavedReports();
  }

  function handleNew() {
    setCurrentSavedId(null);
    setReportName("");
    setDataSourceId(null);
    setTableName(null);
    setTables([]);
    setConfig(emptyBuilderConfig());
    setPreviewRows([]);
    setHasRunPreview(false);
  }

  async function handleExport(format: "csv" | "excel" | "pdf") {
    if (!dataSourceId || !tableName) return;
    setExporting(format);
    try {
      const res = await fetch("/api/report-builder/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId, table: tableName, config, format, name: reportName || tableName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Could not export as ${format.toUpperCase()}.`);
        return;
      }
      const blob = await res.blob();
      const ext = format === "excel" ? "xlsx" : format;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(reportName || tableName).replace(/[^a-z0-9_-]+/gi, "_")}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Network error exporting as ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  }

  const chartData: ChartDatum[] = useMemo(() => {
    if (config.chartType === "table" || !config.chartCategory) return [];
    const valueKey = valueKeyFor(config, config.chartValue);
    if (!valueKey) return [];
    return previewRows.map((row) => ({
      label: String(row[config.chartCategory as string] ?? ""),
      value: Number(row[valueKey]) || 0,
    }));
  }, [previewRows, config]);

  const previewColumns = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12">
      <motion.div initial="hidden" animate="show" variants={fadeIn}>
        <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          REPORT BUILDER
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Interactive Report Builder</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Pick a data source and table, choose and reorder columns, filter and group the data, and preview a chart
          live &mdash; no AI request needed.
        </p>
      </motion.div>

      {error && (
        <Alert icon={WarningCircle} tone="destructive">
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Saved reports sidebar */}
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader icon={Database} title="Saved reports" />
            <button
              onClick={handleNew}
              className="flex items-center justify-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Plus size={13} weight="bold" />
              New report
            </button>
            {savedLoading && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleNotch size={12} weight="bold" className="animate-spin" />
                Loading...
              </p>
            )}
            {!savedLoading && savedReports.length === 0 && (
              <p className="text-xs text-muted-foreground">No saved reports yet.</p>
            )}
            <div className="flex flex-col gap-1.5">
              {savedReports.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-xs ${
                    currentSavedId === r.id ? "border-primary bg-primary/5" : "border-[var(--color-border)]"
                  }`}
                >
                  <button onClick={() => loadSaved(r)} className="min-w-0 flex-1 truncate text-left font-medium text-foreground">
                    {r.name}
                  </button>
                  <button
                    onClick={() => deleteSaved(r.id)}
                    className="shrink-0 text-muted-foreground hover:text-red-600"
                    title="Delete"
                  >
                    <Trash size={12} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Builder */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon={Database} title="Data source" />
            <DataSourcePicker
              dataSources={dataSources}
              dataSourceId={dataSourceId}
              tableName={tableName}
              tables={tables}
              schemaLoading={schemaLoading}
              onDataSourceChange={handleDataSourceChange}
              onTableChange={handleTableChange}
            />
          </Card>

          {selectedTable && (
            <>
              <BuilderConfigEditor selectedTable={selectedTable} config={config} onChange={(updater) => setConfig(updater)} />

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={runPreview}
                    disabled={previewLoading || config.columns.length === 0}
                    className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {previewLoading ? (
                      <CircleNotch size={15} weight="bold" className="animate-spin" />
                    ) : (
                      <Play size={15} weight="bold" />
                    )}
                    Run preview
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={reportName}
                      onChange={(e) => setReportName(e.target.value)}
                      placeholder="Report name"
                      className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving || !reportName.trim() || config.columns.length === 0}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <FloppyDisk size={14} weight="bold" />}
                      {currentSavedId ? "Update" : "Save"}
                    </button>
                  </div>
                </div>

                {hasRunPreview && !previewLoading && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Export</span>
                    <ExportButton icon={FileXls} label="Excel" busy={exporting === "excel"} onClick={() => handleExport("excel")} />
                    <ExportButton icon={FileCsv} label="CSV" busy={exporting === "csv"} onClick={() => handleExport("csv")} />
                    <ExportButton icon={FilePdf} label="PDF" busy={exporting === "pdf"} onClick={() => handleExport("pdf")} />
                  </div>
                )}
              </Card>

              {hasRunPreview && (
                <Card>
                  <CardHeader icon={config.chartType === "table" ? TableIcon : ChartBar} title="Preview" />

                  {previewLoading && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CircleNotch size={16} weight="bold" className="animate-spin" />
                      Running query...
                    </p>
                  )}

                  {!previewLoading && previewRows.length === 0 && <p className="text-sm text-muted-foreground">No data found.</p>}

                  {!previewLoading && previewRows.length > 0 && config.chartType === "table" && (
                    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-muted">
                            {previewColumns.map((col) => (
                              <th key={col} className="px-3 py-2 font-semibold text-muted-foreground">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, i) => (
                            <tr key={i} className="border-t border-[var(--color-border)] hover:bg-muted/40">
                              {previewColumns.map((col) => (
                                <td key={col} className="px-3 py-2 text-foreground">
                                  {String(row[col] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!previewLoading && previewRows.length > 0 && config.chartType !== "table" && (
                    <div className="h-80 w-full">
                      {config.chartType === "bar" && <BarChartSVG data={chartData} />}
                      {config.chartType === "line" && <LineChartSVG data={chartData} />}
                      {config.chartType === "pie" && <PieChartSVG data={chartData} />}
                    </div>
                  )}

                  {previewSql && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-muted-foreground">Generated SQL</summary>
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-[#0f172a] p-3 text-slate-100">{previewSql}</pre>
                    </details>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportButton({
  icon: Icon,
  label,
  busy,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; weight?: "bold" }>;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      {busy ? <CircleNotch size={13} weight="bold" className="animate-spin" /> : <Icon size={13} weight="bold" />}
      {label}
    </button>
  );
}
