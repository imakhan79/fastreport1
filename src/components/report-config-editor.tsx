"use client";

import { useState } from "react";
import {
  ChartBar,
  ChartLine,
  ChartPieSlice,
  Table as TableIcon,
  DotsSixVertical,
  CaretUp,
  CaretDown,
  X,
  Plus,
  FunnelSimple,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { Card, CardHeader } from "@/components/report-blocks";
import {
  AGGREGATE_FNS,
  FILTER_OPERATORS,
  FILTER_OPERATOR_LABELS,
  aliasFor,
  type AggregateFn,
  type BuilderConfig,
  type ChartType,
  type DataSourceSummary,
  type FilterOperator,
  type IntrospectedTable,
} from "@/lib/report-builder-types";

export function DataSourcePicker({
  dataSources,
  dataSourceId,
  tableName,
  tables,
  schemaLoading,
  onDataSourceChange,
  onTableChange,
}: {
  dataSources: DataSourceSummary[];
  dataSourceId: number | null;
  tableName: string | null;
  tables: IntrospectedTable[];
  schemaLoading: boolean;
  onDataSourceChange: (id: number) => void;
  onTableChange: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={dataSourceId ?? ""}
        onChange={(e) => e.target.value && onDataSourceChange(Number(e.target.value))}
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
        onChange={(e) => e.target.value && onTableChange(e.target.value)}
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
  );
}

/** Columns + Filters + Sort + Chart-type panels, shared by the Report Builder page and the Dashboard "add widget" flow. */
export function BuilderConfigEditor({
  selectedTable,
  config,
  onChange,
}: {
  selectedTable: IntrospectedTable;
  config: BuilderConfig;
  onChange: (updater: (prev: BuilderConfig) => BuilderConfig) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function toggleColumn(column: string) {
    onChange((prev) => {
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
    onChange((prev) => ({
      ...prev,
      aggregates:
        fn === "none"
          ? prev.aggregates.filter((a) => a.column !== column)
          : [...prev.aggregates.filter((a) => a.column !== column), { column, fn }],
    }));
  }

  function reorderColumns(from: number, to: number) {
    onChange((prev) => {
      const cols = [...prev.columns];
      const [moved] = cols.splice(from, 1);
      cols.splice(to, 0, moved);
      return { ...prev, columns: cols };
    });
  }

  function addFilter() {
    const firstColumn = selectedTable.columns[0]?.name;
    if (!firstColumn) return;
    onChange((prev) => ({ ...prev, filters: [...prev.filters, { column: firstColumn, operator: "eq", value: "" }] }));
  }

  function updateFilter(index: number, patch: Partial<BuilderConfig["filters"][number]>) {
    onChange((prev) => ({ ...prev, filters: prev.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)) }));
  }

  function removeFilter(index: number) {
    onChange((prev) => ({ ...prev, filters: prev.filters.filter((_, i) => i !== index) }));
  }

  const sortableColumns = (() => {
    const plain = config.columns.filter((c) => !config.aggregates.some((a) => a.column === c));
    const aggregated = config.aggregates.map((a) => aliasFor(a.column, a.fn));
    return [...plain, ...aggregated];
  })();

  function addSort() {
    const firstColumn = sortableColumns[0];
    if (!firstColumn) return;
    onChange((prev) => ({ ...prev, sort: [...prev.sort, { column: firstColumn, direction: "asc" }] }));
  }

  function updateSort(index: number, patch: Partial<BuilderConfig["sort"][number]>) {
    onChange((prev) => ({ ...prev, sort: prev.sort.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }

  function removeSort(index: number) {
    onChange((prev) => ({ ...prev, sort: prev.sort.filter((_, i) => i !== index) }));
  }

  function setChartType(chartType: ChartType) {
    onChange((prev) => ({ ...prev, chartType }));
  }

  return (
    <>
      <Card>
        <CardHeader icon={TableIcon} title="Columns" />
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {selectedTable.columns.map((col) => (
            <label key={col.name} className="flex items-center gap-1.5 text-xs text-foreground">
              <input type="checkbox" checked={config.columns.includes(col.name)} onChange={() => toggleColumn(col.name)} />
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
                <DotsSixVertical size={14} weight="bold" aria-hidden="true" className="shrink-0 cursor-grab text-muted-foreground" />
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => i > 0 && reorderColumns(i, i - 1)}
                    disabled={i === 0}
                    aria-label={`Move ${col} earlier`}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <CaretUp size={10} weight="bold" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => i < config.columns.length - 1 && reorderColumns(i, i + 1)}
                    disabled={i === config.columns.length - 1}
                    aria-label={`Move ${col} later`}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <CaretDown size={10} weight="bold" aria-hidden="true" />
                  </button>
                </div>
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
                <button
                  onClick={() => toggleColumn(col)}
                  aria-label={`Remove ${col} from selected columns`}
                  className="shrink-0 text-muted-foreground hover:text-red-600"
                >
                  <X size={13} weight="bold" aria-hidden="true" />
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
              <button onClick={() => removeFilter(i)} aria-label="Remove filter" className="text-muted-foreground hover:text-red-600">
                <X size={13} weight="bold" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button onClick={addFilter} className="flex w-fit items-center gap-1.5 text-xs font-medium text-primary hover:underline">
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
              <button onClick={() => removeSort(i)} aria-label="Remove sort" className="text-muted-foreground hover:text-red-600">
                <X size={13} weight="bold" aria-hidden="true" />
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
                onChange={(e) => onChange((prev) => ({ ...prev, chartCategory: e.target.value || null }))}
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
                onChange={(e) => onChange((prev) => ({ ...prev, chartValue: e.target.value || null }))}
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
    </>
  );
}
