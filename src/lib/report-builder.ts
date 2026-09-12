import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { resolveConnectionString, isAppOwnedConnection, executeReadOnlyQuery, type IntrospectedTable } from "./ai/query-executor";
import { AGGREGATE_FNS, FILTER_OPERATORS, type AggregateFn, type BuilderConfig, type FilterOperator } from "./report-builder-types";

export class ReportBuilderError extends Error {}
export type { AggregateFn, FilterOperator, SortDirection, AggregateSpec, FilterSpec, SortSpec, ChartType, BuilderConfig } from "./report-builder-types";

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!IDENTIFIER_RE.test(name)) {
    throw new ReportBuilderError(`Invalid identifier "${name}".`);
  }
  return `"${name}"`;
}

function findTable(tables: IntrospectedTable[], tableName: string): IntrospectedTable {
  const table = tables.find((t) => t.name === tableName);
  if (!table) throw new ReportBuilderError(`Table "${tableName}" is not part of this data source's schema.`);
  return table;
}

function assertColumnExists(table: IntrospectedTable, column: string): void {
  if (!table.columns.some((c) => c.name === column)) {
    throw new ReportBuilderError(`Column "${column}" does not exist on table "${table.name}".`);
  }
}

const OPERATOR_SQL: Record<FilterOperator, string | null> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  contains: "ILIKE",
  is_null: null,
  not_null: null,
};

/**
 * Builds a parameterized, read-only SELECT from a structured (not
 * free-text) config. Every table/column/function/operator name is checked
 * against an explicit allowlist (the data source's cached schema, or a
 * fixed enum) before being interpolated - the only place raw user input
 * ever reaches the query string is as a `$n` bound parameter value.
 */
export function buildSelectQuery(
  tables: IntrospectedTable[],
  tableName: string,
  orgId: number,
  config: BuilderConfig,
  limit: number,
  assumeOrgScoped = false
): { sql: string; params: unknown[] } {
  const table = findTable(tables, tableName);

  if (!config.columns || config.columns.length === 0) {
    throw new ReportBuilderError("Select at least one column.");
  }
  for (const col of config.columns) assertColumnExists(table, col);
  for (const agg of config.aggregates ?? []) {
    assertColumnExists(table, agg.column);
    if (!AGGREGATE_FNS.includes(agg.fn)) throw new ReportBuilderError(`Unknown aggregate function "${agg.fn}".`);
  }
  for (const filter of config.filters ?? []) {
    assertColumnExists(table, filter.column);
    if (!FILTER_OPERATORS.includes(filter.operator)) {
      throw new ReportBuilderError(`Unknown filter operator "${filter.operator}".`);
    }
  }
  for (const sort of config.sort ?? []) {
    if (!config.columns.includes(sort.column) && !(config.aggregates ?? []).some((a) => a.column === sort.column)) {
      throw new ReportBuilderError(`Cannot sort by "${sort.column}" - it isn't selected.`);
    }
  }

  const hasAggregates = (config.aggregates ?? []).length > 0;
  const aggregatedColumns = new Set((config.aggregates ?? []).map((a) => a.column));
  const plainColumns = config.columns.filter((c) => !aggregatedColumns.has(c));

  const selectParts: string[] = [];
  const aliasFor = (col: string, fn: AggregateFn) => `${col}_${fn}`;

  for (const col of plainColumns) selectParts.push(quoteIdent(col));
  for (const agg of config.aggregates ?? []) {
    selectParts.push(`${agg.fn}(${quoteIdent(agg.column)}) as ${quoteIdent(aliasFor(agg.column, agg.fn))}`);
  }

  const params: unknown[] = [];
  const hasOrgIdColumn = assumeOrgScoped || table.columns.some((c) => c.name === "org_id");
  const whereClauses: string[] = [];

  if (hasOrgIdColumn) {
    params.push(orgId);
    whereClauses.push(`${quoteIdent("org_id")} = $${params.length}`);
  }

  for (const filter of config.filters ?? []) {
    const sqlOp = OPERATOR_SQL[filter.operator];
    if (sqlOp === null) {
      whereClauses.push(`${quoteIdent(filter.column)} IS ${filter.operator === "is_null" ? "" : "NOT "}NULL`);
      continue;
    }
    if (filter.value === undefined || filter.value === "") {
      throw new ReportBuilderError(`Filter on "${filter.column}" needs a value.`);
    }
    params.push(filter.operator === "contains" ? `%${filter.value}%` : filter.value);
    whereClauses.push(`${quoteIdent(filter.column)} ${sqlOp} $${params.length}`);
  }

  const groupByParts = hasAggregates && plainColumns.length > 0 ? plainColumns.map(quoteIdent) : [];

  const orderByParts = (config.sort ?? []).map((s) => {
    const isAggregated = (config.aggregates ?? []).find((a) => a.column === s.column);
    const expr = isAggregated ? quoteIdent(aliasFor(isAggregated.column, isAggregated.fn)) : quoteIdent(s.column);
    return `${expr} ${s.direction === "desc" ? "DESC" : "ASC"}`;
  });

  const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 100, 5000));

  let sql = `SELECT ${selectParts.join(", ")} FROM ${quoteIdent(table.name)}`;
  if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(" AND ")}`;
  if (groupByParts.length > 0) sql += ` GROUP BY ${groupByParts.join(", ")}`;
  if (orderByParts.length > 0) sql += ` ORDER BY ${orderByParts.join(", ")}`;
  sql += ` LIMIT ${safeLimit}`;

  return { sql, params };
}

export async function runBuilderQuery(
  admin: SupabaseClient<Database>,
  orgId: number,
  dataSourceId: number,
  tableName: string,
  config: BuilderConfig,
  limit: number
): Promise<{ rows: Record<string, unknown>[]; sql: string; rowCount: number }> {
  const { data: dataSource, error } = await admin
    .from("data_sources")
    .select("*")
    .eq("id", dataSourceId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !dataSource) throw new ReportBuilderError("Data source not found.");

  const tables = ((dataSource.schema_cache as { tables?: IntrospectedTable[] } | null)?.tables ?? []) as IntrospectedTable[];
  const assumeOrgScoped = isAppOwnedConnection(dataSource.connection_ref);
  const { sql, params } = buildSelectQuery(tables, tableName, orgId, config, limit, assumeOrgScoped);

  const connectionString = resolveConnectionString(dataSource.connection_ref);
  const result = await executeReadOnlyQuery(sql, connectionString, params);

  return { rows: result.rows, sql, rowCount: result.rowCount };
}

/**
 * A saved report_builder_reports row snapshots {dataSourceId, table} independently
 * of query execution, so it never goes through buildSelectQuery's own allowlist
 * checks at save time - validate here instead of trusting the client-supplied ids.
 */
export async function assertDataSourceTable(
  admin: SupabaseClient<Database>,
  orgId: number,
  dataSourceId: number,
  tableName: string
): Promise<void> {
  const { data: dataSource, error } = await admin
    .from("data_sources")
    .select("schema_cache")
    .eq("id", dataSourceId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !dataSource) throw new ReportBuilderError("Data source not found.");

  const tables = ((dataSource.schema_cache as { tables?: IntrospectedTable[] } | null)?.tables ?? []) as IntrospectedTable[];
  findTable(tables, tableName);
}
