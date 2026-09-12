"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowClockwise,
  ArrowsOutSimple,
  ChartBar,
  Gauge,
  Plus,
  Table as TableIcon,
  Trash,
  CircleNotch,
  WarningCircle,
  X,
  DotsSixVertical,
  CaretUp,
  CaretDown,
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

type WidgetType = "kpi" | "chart" | "table";

type Widget = {
  id: number;
  widget_type: WidgetType;
  title: string;
  data_source_id: number | null;
  table_name: string;
  config: BuilderConfig;
  position: number;
};

type Dashboard = { id: number; name: string; refresh_seconds: number; updated_at: string };

type WidgetState = { rows: Record<string, unknown>[]; loading: boolean; error: string | null; updatedAt: Date | null };

const REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "Every 30s", value: 30 },
  { label: "Every 1 min", value: 60 },
  { label: "Every 5 min", value: 300 },
  { label: "Every 15 min", value: 900 },
];

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export default function DashboardDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const dashboardId = Number(params.id);

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [widgetStates, setWidgetStates] = useState<Record<number, WidgetState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showAddWidget, setShowAddWidget] = useState(false);

  const loadDashboard = useCallback(async () => {
    const res = await fetch(`/api/dashboards/${dashboardId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load dashboard.");
      return;
    }
    setDashboard(data.dashboard);
    setWidgets(data.widgets ?? []);
  }, [dashboardId]);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setLoading(true);
      await loadDashboard();
      setLoading(false);
    });
  }, [loadDashboard]);

  const fetchWidgetData = useCallback(async (widget: Widget) => {
    setWidgetStates((prev) => ({
      ...prev,
      [widget.id]: { rows: prev[widget.id]?.rows ?? [], loading: true, error: null, updatedAt: prev[widget.id]?.updatedAt ?? null },
    }));

    if (!widget.data_source_id) {
      setWidgetStates((prev) => ({
        ...prev,
        [widget.id]: { rows: [], loading: false, error: "Data source was removed.", updatedAt: new Date() },
      }));
      return;
    }

    try {
      const res = await fetch("/api/report-builder/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId: widget.data_source_id, table: widget.table_name, config: widget.config }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWidgetStates((prev) => ({
          ...prev,
          [widget.id]: { rows: [], loading: false, error: data.error ?? "Query failed.", updatedAt: new Date() },
        }));
      } else {
        setWidgetStates((prev) => ({
          ...prev,
          [widget.id]: { rows: data.rows ?? [], loading: false, error: null, updatedAt: new Date() },
        }));
      }
    } catch {
      setWidgetStates((prev) => ({
        ...prev,
        [widget.id]: { rows: [], loading: false, error: "Network error.", updatedAt: new Date() },
      }));
    }
  }, []);

  const refreshAll = useCallback(() => {
    for (const w of widgets) void fetchWidgetData(w);
  }, [widgets, fetchWidgetData]);

  useEffect(() => {
    if (widgets.length > 0) void Promise.resolve().then(() => refreshAll());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets.map((w) => w.id).join(",")]);

  const refreshSeconds = dashboard?.refresh_seconds ?? 0;
  const refreshAllRef = useRef(refreshAll);
  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  useEffect(() => {
    if (!refreshSeconds) return;
    const interval = setInterval(() => refreshAllRef.current(), refreshSeconds * 1000);
    return () => clearInterval(interval);
  }, [refreshSeconds]);

  async function handleRefreshIntervalChange(value: number) {
    if (!dashboard) return;
    const previous = dashboard.refresh_seconds;
    setDashboard({ ...dashboard, refresh_seconds: value });
    const res = await fetch(`/api/dashboards/${dashboardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshSeconds: value }),
    });
    if (!res.ok) {
      setDashboard((prev) => (prev ? { ...prev, refresh_seconds: previous } : prev));
      setError("Failed to save the refresh interval - reverted.");
    }
  }

  async function handleDeleteWidget(widgetId: number) {
    const previous = widgets;
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    const res = await fetch(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, { method: "DELETE" });
    if (!res.ok) {
      setWidgets(previous);
      setError("Failed to remove the widget - it's still on this dashboard.");
    }
  }

  async function persistOrder(next: Widget[]) {
    const previous = widgets;
    setWidgets(next);
    const res = await fetch(`/api/dashboards/${dashboardId}/widgets/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((w) => w.id) }),
    });
    if (!res.ok) {
      setWidgets(previous);
      setError("Failed to save the new widget order - reverted.");
    }
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...widgets];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    void persistOrder(next);
  }

  /** Keyboard-operable alternative to drag-to-reorder (WCAG 2.2 dragging-movements). */
  function moveWidget(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= widgets.length) return;
    const next = [...widgets];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    void persistOrder(next);
  }

  function drillDown(widget: Widget) {
    sessionStorage.setItem(
      REPORT_BUILDER_PRELOAD_KEY,
      JSON.stringify({ dataSourceId: widget.data_source_id, table: widget.table_name, config: widget.config, name: widget.title })
    );
    router.push("/report-builder");
  }

  async function handleWidgetAdded(widget: Widget) {
    setWidgets((prev) => [...prev, widget]);
    setShowAddWidget(false);
    await fetchWidgetData(widget);
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-16 text-sm text-muted-foreground">
        <CircleNotch size={16} weight="bold" className="animate-spin" />
        Loading dashboard...
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Alert icon={WarningCircle} tone="destructive">
          {error}
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12">
      <motion.div initial="hidden" animate="show" variants={fadeIn} className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="rounded-full border border-[var(--color-border)] bg-card/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
            LIVE DASHBOARD
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">{dashboard?.name}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={refreshSeconds}
            onChange={(e) => handleRefreshIntervalChange(Number(e.target.value))}
            className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
          >
            {REFRESH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={refreshAll}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <ArrowClockwise size={14} weight="bold" />
            Refresh now
          </button>
          <button
            onClick={() => setShowAddWidget((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={14} weight="bold" />
            Add widget
          </button>
        </div>
      </motion.div>

      {error && (
        <Alert icon={WarningCircle} tone="destructive">
          {error}
        </Alert>
      )}

      {showAddWidget && (
        <AddWidgetPanel dashboardId={dashboardId} onAdded={handleWidgetAdded} onCancel={() => setShowAddWidget(false)} />
      )}

      {widgets.length === 0 && !showAddWidget && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          No widgets yet &mdash; add one to start monitoring your data.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {widgets.map((widget, i) => (
          <motion.div
            key={widget.id}
            initial="hidden"
            animate="show"
            variants={fadeIn}
            transition={{ delay: Math.min(i * 0.04, 0.4) }}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
          >
            <WidgetCard
              widget={widget}
              state={widgetStates[widget.id]}
              onDelete={() => handleDeleteWidget(widget.id)}
              onDrillDown={() => drillDown(widget)}
              onMoveEarlier={i > 0 ? () => moveWidget(i, -1) : undefined}
              onMoveLater={i < widgets.length - 1 ? () => moveWidget(i, 1) : undefined}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function WidgetCard({
  widget,
  state,
  onDelete,
  onDrillDown,
  onMoveEarlier,
  onMoveLater,
}: {
  widget: Widget;
  state: WidgetState | undefined;
  onDelete: () => void;
  onDrillDown: () => void;
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const rows = useMemo(() => state?.rows ?? [], [state?.rows]);

  const chartData: ChartDatum[] = useMemo(() => {
    if (!widget.config.chartCategory) return [];
    const valueKey = valueKeyFor(widget.config, widget.config.chartValue);
    if (!valueKey) return [];
    return rows.map((row) => ({
      label: String(row[widget.config.chartCategory as string] ?? ""),
      value: Number(row[valueKey]) || 0,
    }));
  }, [rows, widget.config]);

  const kpiValue = useMemo(() => {
    const valueKey = valueKeyFor(widget.config, widget.config.chartValue ?? widget.config.columns[0]);
    if (!valueKey || rows.length === 0) return null;
    const raw = rows[0][valueKey];
    const num = Number(raw);
    return Number.isFinite(num) ? numberFormatter.format(num) : String(raw ?? "");
  }, [rows, widget.config]);

  const previewColumns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="flex h-72 flex-col rounded-2xl border border-[var(--color-border)] bg-card/70 p-4 backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <DotsSixVertical size={14} weight="bold" aria-hidden="true" className="shrink-0 cursor-grab text-muted-foreground" />
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              onClick={onMoveEarlier}
              disabled={!onMoveEarlier}
              aria-label={`Move "${widget.title}" earlier`}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <CaretUp size={10} weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onMoveLater}
              disabled={!onMoveLater}
              aria-label={`Move "${widget.title}" later`}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <CaretDown size={10} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <h3 className="truncate text-sm font-semibold text-foreground" title={widget.title}>
            {widget.title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onDrillDown}
            title="Drill down"
            aria-label={`Drill down into "${widget.title}"`}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowsOutSimple size={13} weight="bold" aria-hidden="true" />
          </button>
          <button
            onClick={onDelete}
            title="Remove"
            aria-label={`Remove widget "${widget.title}"`}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
          >
            <Trash size={13} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {(!state || state.loading) && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <CircleNotch size={14} weight="bold" className="animate-spin" />
          </div>
        )}

        {state && !state.loading && state.error && (
          <p className="flex items-start gap-1.5 text-xs text-red-600">
            <WarningCircle size={13} weight="bold" className="mt-0.5 shrink-0" />
            {state.error}
          </p>
        )}

        {state && !state.loading && !state.error && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">No data.</p>
        )}

        {state && !state.loading && !state.error && rows.length > 0 && widget.widget_type === "kpi" && (
          <div className="flex h-full flex-col items-center justify-center">
            <span className="text-3xl font-bold text-foreground">{kpiValue}</span>
          </div>
        )}

        {state && !state.loading && !state.error && rows.length > 0 && widget.widget_type === "chart" && (
          <div className="h-full w-full">
            {widget.config.chartType === "bar" && <BarChartSVG data={chartData} />}
            {widget.config.chartType === "line" && <LineChartSVG data={chartData} />}
            {widget.config.chartType === "pie" && <PieChartSVG data={chartData} />}
            {widget.config.chartType === "table" && (
              <MiniTable rows={rows} columns={previewColumns} />
            )}
          </div>
        )}

        {state && !state.loading && !state.error && rows.length > 0 && widget.widget_type === "table" && (
          <MiniTable rows={rows} columns={previewColumns} />
        )}
      </div>

      {state?.updatedAt && (
        <p className="mt-2 text-[10px] text-muted-foreground">Updated {state.updatedAt.toLocaleTimeString()}</p>
      )}
    </div>
  );
}

function MiniTable({ rows, columns }: { rows: Record<string, unknown>[]; columns: string[] }) {
  return (
    <div className="h-full overflow-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="bg-muted">
            {columns.map((col) => (
              <th key={col} className="px-2 py-1.5 font-semibold text-muted-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-t border-[var(--color-border)]">
              {columns.map((col) => (
                <td key={col} className="px-2 py-1.5 text-foreground">
                  {String(row[col] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddWidgetPanel({
  dashboardId,
  onAdded,
  onCancel,
}: {
  dashboardId: number;
  onAdded: (widget: Widget) => void;
  onCancel: () => void;
}) {
  const [dataSources, setDataSources] = useState<DataSourceSummary[]>([]);
  const [dataSourceId, setDataSourceId] = useState<number | null>(null);
  const [tables, setTables] = useState<IntrospectedTable[]>([]);
  const [tableName, setTableName] = useState<string | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [config, setConfig] = useState<BuilderConfig>(emptyBuilderConfig());
  const [widgetType, setWidgetType] = useState<WidgetType>("chart");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const res = await fetch("/api/data-sources");
      if (res.ok) {
        const data = await res.json();
        setDataSources(data.dataSources ?? []);
      }
    });
  }, []);

  const selectedTable = useMemo(() => tables.find((t) => t.name === tableName) ?? null, [tables, tableName]);

  async function handleDataSourceChange(id: number) {
    setDataSourceId(id);
    setTableName(null);
    setTables([]);
    setConfig(emptyBuilderConfig());
    setSchemaLoading(true);
    try {
      const res = await fetch(`/api/report-builder/schema?dataSourceId=${id}`);
      const data = await res.json();
      if (res.ok) setTables(data.tables ?? []);
    } finally {
      setSchemaLoading(false);
    }
  }

  function handleTableChange(name: string) {
    setTableName(name);
    setConfig(emptyBuilderConfig());
  }

  async function handleAdd() {
    if (!dataSourceId || !tableName || !title.trim() || config.columns.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetType, title: title.trim(), dataSourceId, table: tableName, config }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add widget.");
      } else {
        onAdded(data.widget);
      }
    } catch {
      setError("Network error adding widget.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardHeader icon={Plus} title="Add widget" />
        <button onClick={onCancel} aria-label="Cancel adding widget" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
          <X size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <Alert icon={WarningCircle} tone="destructive">
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["kpi", Gauge, "KPI number"],
            ["chart", ChartBar, "Chart"],
            ["table", TableIcon, "Table"],
          ] as const
        ).map(([type, Icon, label]) => (
          <button
            key={type}
            onClick={() => setWidgetType(type)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              widgetType === type
                ? "border-primary bg-primary text-on-primary"
                : "border-[var(--color-border)] text-foreground hover:bg-muted"
            }`}
          >
            <Icon size={14} weight="bold" />
            {label}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Widget title"
        className="rounded-lg border border-[var(--color-border)] bg-background px-3 py-2 text-sm text-foreground"
      />

      <DataSourcePicker
        dataSources={dataSources}
        dataSourceId={dataSourceId}
        tableName={tableName}
        tables={tables}
        schemaLoading={schemaLoading}
        onDataSourceChange={handleDataSourceChange}
        onTableChange={handleTableChange}
      />

      {selectedTable && <BuilderConfigEditor selectedTable={selectedTable} config={config} onChange={(updater) => setConfig(updater)} />}

      <button
        onClick={handleAdd}
        disabled={saving || !title.trim() || config.columns.length === 0}
        className="flex w-fit items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : <Plus size={15} weight="bold" />}
        Add to dashboard
      </button>
    </Card>
  );
}
