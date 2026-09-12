"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChartBar,
  ChartLine,
  ChartPieSlice,
  Table as TableIcon,
  DotsSixVertical,
  X,
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
  FunnelSimple,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { fadeIn, Card, CardHeader, Alert } from "@/components/report-blocks";
import { BarChartSVG, LineChartSVG, PieChartSVG, type ChartDatum } from "@/components/report-builder-charts";
import {
  AGGREGATE_FNS,
  FILTER_OPERATORS,
  FILTER_OPERATOR_LABELS,
  type AggregateFn,
  type BuilderConfig,
  type ChartType,
  type FilterOperator,
  type FilterSpec,
  type IntrospectedTable,
  type SortSpec,
} from "@/lib/report-builder-types";

type DataSourceSummary = { id: number; name: string; kind: string; tableNames: string[] };
type SavedReport = {
  id: number;
  name: string;
  table_name: string;
  data_source_id: number | null;
  config: BuilderConfig;
  updated_at: string;
};

function emptyConfig(): BuilderConfig {
  return { columns: [], aggregates: [], filters: [], sort: [], chartType: "table", chartCategory: null, chartValue: null };
}

function aliasFor(column: string, fn: AggregateFn): string {
  return `${column}_${fn}`;
}

function valueKeyFor(config: BuilderConfig, column: string | null | undefined): string | null {
  if (!column) return null;
  const agg = config.aggregates.find((a) => a.column === column);
  return agg ? aliasFor(agg.column, agg.fn) : column;
}

export default function ReportBuilderPage() {
  const [dataSources, setDataSources] = useState<DataSourceSummary[]>([]);
  const [dataSourceId, setDataSourceId] = useState<number | null>(null);
  const [tables, setTables] = useState<IntrospectedTable[]>([]);
  const [tableName, setTableName] = useState<string | null>(null);
  const [config, setConfig] = useState<BuilderConfig>(emptyConfig());

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
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
    void Promise.resolve().then(() => {
      void loadDataSources();
      void loadSavedReports();
    });
  }, [loadDataSources, loadSavedReports]);

  const selectedTable = useMemo(() => tables.find((t) => t.name === tableName) ?? null, [tables, tableName]);

  async function handleDataSourceChange(id: number) {
    setDataSourceId(id);
    setTableName(null);
    setTables([]);
    setConfig(emptyConfig());
    setPreviewRows([]);
    setHasRunPreview(false);
    setError(null);
    setSchemaLoading(true);
    try {
      const res = await fetch(`/api/report-builder/schema?dataSourceId=${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load that data source's schema.");
      } else {
        setTables(data.tables ?? []);
      }
    } catch {
      setError("Network error loading schema.");
    } finally {
      setSchemaLoading(false);
    }
  }

  function handleTableChange(name: string) {
    setTableName(name);
    setConfig(emptyConfig());
    setPreviewRows([]);
    setHasRunPreview(false);
  }

  function toggleColumn(column: string) {
    setConfig((prev) => {
      const included = prev.columns.includes(column);
      return {
        ...prev,
        columns: included ? prev.columns.filter((c) => c !== column) : [...prev.columns, column],
        aggregates: included ? prev.aggregates.filter((a) => a.column !== column) : prev.aggregates,
        sort: included ? prev.sort.filter((s) => s.column !== column) : prev.sort,
        chartCategory: included && prev.chartCategory === column ? null : prev.chartCategory,
        chartValue: included && prev.chartValue === column ? null : prev.chartValue,
      };
    });
  }

  function setAggregate(column: string, fn: AggregateFn | "none") {
    setConfig((prev) => ({
      ...prev,
      aggregates:
        fn === "none"
          ? prev.aggregates.filter((a) => a.column !== column)
          : [...prev.aggregates.filter((a) => a.column !== column), { column, fn }],
    }));
  }

  function reorderColumns(from: number, to: number) {
    setConfig((prev) => {
      const cols = [...prev.columns];
      const [moved] = cols.splice(from, 1);
      cols.splice(to, 0, moved);
      return { ...prev, columns: cols };
    });
  }

  function addFilter() {
    if (!selectedTable) return;
    const firstColumn = selectedTable.columns[0]?.name;
    if (!firstColumn) return;
    setConfig((prev) => ({ ...prev, filters: [...prev.filters, { column: firstColumn, operator: "eq", value: "" }] }));
  }

  function updateFilter(index: number, patch: Partial<FilterSpec>) {
    setConfig((prev) => ({
      ...prev,
      filters: prev.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  }

  function removeFilter(index: number) {
    setConfig((prev) => ({ ...prev, filters: prev.filters.filter((_, i) => i !== index) }));
  }

  const sortableColumns = useMemo(() => {
    const plain = config.columns.filter((c) => !config.aggregates.some((a) => a.column === c));
    const aggregated = config.aggregates.map((a) => aliasFor(a.column, a.fn));
    return [...plain, ...aggregated];
  }, [config.columns, config.aggregates]);

  function addSort() {
    const firstColumn = sortableColumns[0];
    if (!firstColumn) return;
    setConfig((prev) => ({ ...prev, sort: [...prev.sort, { column: firstColumn, direction: "asc" }] }));
  }

  function updateSort(index: number, patch: Partial<SortSpec>) {
    setConfig((prev) => ({ ...prev, sort: prev.sort.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }

  function removeSort(index: number) {
    setConfig((prev) => ({ ...prev, sort: prev.sort.filter((_, i) => i !== index) }));
  }

  function setChartType(chartType: ChartType) {
    setConfig((prev) => ({ ...prev, chartType }));
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
      setSchemaLoading(true);
      try {
        const res = await fetch(`/api/report-builder/schema?dataSourceId=${report.data_source_id}`);
        const data = await res.json();
        if (res.ok) setTables(data.tables ?? []);
      } finally {
        setSchemaLoading(false);
      }
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
    setConfig(emptyConfig());
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
            <div className="flex flex-wrap gap-3">
              <select
                value={dataSourceId ?? ""}
                onChange={(e) => e.target.value && handleDataSourceChange(Number(e.target.value))}
                className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="" disabled>
                  Select a data source&hellip;
                </option>
                {dataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                  </option>
                ))}
              </select>

              <select
                value={tableName ?? ""}
                disabled={!dataSourceId || schemaLoading}
                onChange={(e) => e.target.value && handleTableChange(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
              >
                <option value="" disabled>
                  {schemaLoading ? "Loading tables..." : "Select a table…"}
                </option>
                {tables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>

              {dataSources.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No data sources yet &mdash; connect one on the{" "}
                  <a href="/data-sources" className="font-medium text-primary hover:underline">
                    Connectors
                  </a>{" "}
                  page or import a CSV/Excel file first.
                </p>
              )}
            </div>
          </Card>

          {selectedTable && (
            <>
              <Card>
                <CardHeader icon={TableIcon} title="Columns" />
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {selectedTable.columns.map((col) => (
                    <label key={col.name} className="flex items-center gap-1.5 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={config.columns.includes(col.name)}
                        onChange={() => toggleColumn(col.name)}
                      />
                      <span className="truncate" title={col.type}>
                        {col.name}
                      </span>
                    </label>
                  ))}
                </div>

                {config.columns.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-4">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Selected (drag to reorder, optionally aggregate)
                    </p>
                    {config.columns.map((col, i) => (
                      <div
                        key={col}
                        draggable
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIndex !== null && dragIndex !== i) reorderColumns(dragIndex, i);
                          setDragIndex(null);
                        }}
                        className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-card/50 px-2.5 py-1.5 text-xs"
                      >
                        <DotsSixVertical size={14} weight="bold" className="shrink-0 cursor-grab text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{col}</span>
                        <select
                          value={config.aggregates.find((a) => a.column === col)?.fn ?? "none"}
                          onChange={(e) => setAggregate(col, e.target.value as AggregateFn | "none")}
                          className="rounded-md border border-[var(--color-border)] bg-background px-1.5 py-1 text-xs"
                        >
                          <option value="none">no aggregate</option>
                          {AGGREGATE_FNS.map((fn) => (
                            <option key={fn} value={fn}>
                              {fn}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => toggleColumn(col)} className="shrink-0 text-muted-foreground hover:text-red-600">
                          <X size={13} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader icon={FunnelSimple} title="Filters" />
                <div className="flex flex-col gap-2">
                  {config.filters.map((f, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                      <select
                        value={f.column}
                        onChange={(e) => updateFilter(i, { column: e.target.value })}
                        className="rounded-md border border-[var(--color-border)] bg-background px-2 py-1.5"
                      >
                        {selectedTable.columns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.operator}
                        onChange={(e) => updateFilter(i, { operator: e.target.value as FilterOperator })}
                        className="rounded-md border border-[var(--color-border)] bg-background px-2 py-1.5"
                      >
                        {FILTER_OPERATORS.map((op) => (
                          <option key={op} value={op}>
                            {FILTER_OPERATOR_LABELS[op]}
                          </option>
                        ))}
                      </select>
                      {f.operator !== "is_null" && f.operator !== "not_null" && (
                        <input
                          value={f.value ?? ""}
                          onChange={(e) => updateFilter(i, { value: e.target.value })}
                          placeholder="value"
                          className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-background px-2 py-1.5"
                        />
                      )}
                      <button onClick={() => removeFilter(i)} className="text-muted-foreground hover:text-red-600">
                        <X size={13} weight="bold" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addFilter}
                    disabled={!selectedTable}
                    className="flex w-fit items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus size={12} weight="bold" />
                    Add filter
                  </button>
                </div>
              </Card>

              <Card>
                <CardHeader icon={SlidersHorizontal} title="Sort" />
                <div className="flex flex-col gap-2">
                  {config.sort.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                      <select
                        value={s.column}
                        onChange={(e) => updateSort(i, { column: e.target.value })}
                        className="rounded-md border border-[var(--color-border)] bg-background px-2 py-1.5"
                      >
                        {sortableColumns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={s.direction}
                        onChange={(e) => updateSort(i, { direction: e.target.value as "asc" | "desc" })}
                        className="rounded-md border border-[var(--color-border)] bg-background px-2 py-1.5"
                      >
                        <option value="asc">ascending</option>
                        <option value="desc">descending</option>
                      </select>
                      <button onClick={() => removeSort(i)} className="text-muted-foreground hover:text-red-600">
                        <X size={13} weight="bold" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addSort}
                    disabled={sortableColumns.length === 0}
                    className="flex w-fit items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    <Plus size={12} weight="bold" />
                    Add sort
                  </button>
                </div>
              </Card>

              <Card>
                <CardHeader icon={ChartBar} title="Chart" />
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["table", TableIcon, "Table"],
                      ["bar", ChartBar, "Bar"],
                      ["line", ChartLine, "Line"],
                      ["pie", ChartPieSlice, "Pie"],
                    ] as const
                  ).map(([type, Icon, label]) => (
                    <button
                      key={type}
                      onClick={() => setChartType(type)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        config.chartType === type
                          ? "border-primary bg-primary text-on-primary"
                          : "border-[var(--color-border)] text-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon size={14} weight="bold" />
                      {label}
                    </button>
                  ))}
                </div>

                {config.chartType !== "table" && (
                  <div className="flex flex-wrap gap-3 border-t border-[var(--color-border)] pt-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      Category
                      <select
                        value={config.chartCategory ?? ""}
                        onChange={(e) => setConfig((prev) => ({ ...prev, chartCategory: e.target.value || null }))}
                        className="rounded-md border border-[var(--color-border)] bg-background px-2 py-1.5"
                      >
                        <option value="">select&hellip;</option>
                        {config.columns
                          .filter((c) => !config.aggregates.some((a) => a.column === c))
                          .map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      Value
                      <select
                        value={config.chartValue ?? ""}
                        onChange={(e) => setConfig((prev) => ({ ...prev, chartValue: e.target.value || null }))}
                        className="rounded-md border border-[var(--color-border)] bg-background px-2 py-1.5"
                      >
                        <option value="">select&hellip;</option>
                        {config.columns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                            {config.aggregates.find((a) => a.column === c) ? ` (${config.aggregates.find((a) => a.column === c)!.fn})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </Card>

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
