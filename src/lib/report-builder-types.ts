export type AggregateFn = "sum" | "avg" | "count" | "min" | "max";
export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_null" | "not_null";
export type SortDirection = "asc" | "desc";

export type AggregateSpec = { column: string; fn: AggregateFn };
export type FilterSpec = { column: string; operator: FilterOperator; value?: string | number };
export type SortSpec = { column: string; direction: SortDirection };
export type ChartType = "table" | "bar" | "line" | "pie";

export type BuilderConfig = {
  columns: string[];
  aggregates: AggregateSpec[];
  filters: FilterSpec[];
  sort: SortSpec[];
  chartType: ChartType;
  chartCategory?: string | null;
  chartValue?: string | null;
};

export const AGGREGATE_FNS: readonly AggregateFn[] = ["sum", "avg", "count", "min", "max"];
export const FILTER_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "is_null",
  "not_null",
];

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "= equals",
  neq: "≠ not equal",
  gt: "> greater than",
  gte: "≥ at least",
  lt: "< less than",
  lte: "≤ at most",
  contains: "contains",
  is_null: "is empty",
  not_null: "is not empty",
};

export type IntrospectedTable = { name: string; columns: { name: string; type: string }[] };
