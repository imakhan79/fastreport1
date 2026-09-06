/**
 * Binds a design component's freeform data_binding (metric/dimensions are
 * AI-written labels like "signup_count", not guaranteed column names - the
 * Design and Query pipelines run independently, from the same request but
 * without seeing each other's output) to the query's actual result columns,
 * so exports render real computed numbers and per-category series instead
 * of just the component's title as a text label.
 *
 * Best-effort by design: token-overlap matching against real column names,
 * with an aggregation guessed from the metric's wording. Falls back to
 * `null` (caller keeps the old label-only rendering) whenever there isn't
 * at least one numeric column to bind to.
 */

export type DesignComponent = {
  id: string;
  section_id: string;
  type: string;
  title: string;
  chart_type: string;
  data_binding: { metric: string; dimensions: string[] };
};

export type BoundKpi = { kind: "kpi"; value: string };
export type BoundSeries = {
  kind: "series";
  categoryLabel: string;
  valueLabel: string;
  points: { label: string; value: number }[];
};
export type BoundValue = BoundKpi | BoundSeries | null;

const TOTAL_SENTINEL = /^total$/i;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenize(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  let score = 0;
  for (const x of ta) {
    for (const y of tb) {
      if (x === y) score += 1;
      else if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) score += 0.6;
    }
  }
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) score += 2;
  else if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) score += 0.5;
  return score;
}

function bestMatch(target: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const score = similarity(target, c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function isNumeric(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "") return Number.isFinite(Number(v));
  return false;
}

function toNumber(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function isTotalSentinel(v: unknown): boolean {
  return typeof v === "string" && TOTAL_SENTINEL.test(v.trim());
}

function classifyColumns(rows: Record<string, unknown>[]): { numeric: string[]; categorical: string[] } {
  const columns = Object.keys(rows[0] ?? {});
  const numeric: string[] = [];
  const categorical: string[] = [];
  for (const col of columns) {
    const samples = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && !isTotalSentinel(v));
    const numericCount = samples.filter(isNumeric).length;
    if (samples.length > 0 && numericCount / samples.length >= 0.8) numeric.push(col);
    else categorical.push(col);
  }
  return { numeric, categorical };
}

function inferAggregation(text: string): "sum" | "avg" | "count" {
  // tokenize rather than regex-match the raw string: underscores are \w
  // characters, so "\bcount\b" never matches inside "active_regions_count".
  const tokens = new Set(tokenize(text));
  if (tokens.has("avg") || tokens.has("average") || tokens.has("mean")) return "avg";
  if (tokens.has("count") || tokens.has("number")) return "count";
  return "sum";
}

function inferSuperlative(text: string): "max" | "min" | null {
  const tokens = new Set(tokenize(text));
  if (["top", "most", "highest", "best", "largest", "leading"].some((w) => tokens.has(w))) return "max";
  if (["lowest", "least", "smallest", "worst", "bottom"].some((w) => tokens.has(w))) return "min";
  return null;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 });
}

export function bindComponent(component: DesignComponent, rows: Record<string, unknown>[]): BoundValue {
  if (!rows || rows.length === 0) return null;

  const { numeric, categorical } = classifyColumns(rows);
  if (numeric.length === 0) return null;

  const metricCol = bestMatch(component.data_binding.metric, numeric);
  if (!metricCol) return null;

  const dimensionTarget = component.data_binding.dimensions[0] || component.title;
  const dimCol = categorical.length > 0 ? bestMatch(dimensionTarget, categorical) : null;

  const isRollupRow = (row: Record<string, unknown>) => categorical.some((c) => isTotalSentinel(row[c]));
  const leafRows = rows.filter((r) => !isRollupRow(r));
  const grandTotalRow =
    categorical.length > 0 ? rows.find((r) => categorical.every((c) => isTotalSentinel(r[c]))) : undefined;

  if (component.type === "kpi") {
    const superlative = inferSuperlative(component.data_binding.metric) ?? inferSuperlative(component.title);
    if (superlative && dimCol) {
      const pool = leafRows.length > 0 ? leafRows : rows;
      const sorted = [...pool].sort((a, b) => {
        const av = toNumber(a[metricCol]) || 0;
        const bv = toNumber(b[metricCol]) || 0;
        return superlative === "max" ? bv - av : av - bv;
      });
      if (sorted.length === 0) return null;
      return { kind: "kpi", value: String(sorted[0][dimCol]) };
    }

    const agg = inferAggregation(`${component.data_binding.metric} ${component.title}`);
    if (grandTotalRow && agg === "sum" && isNumeric(grandTotalRow[metricCol])) {
      return { kind: "kpi", value: formatNumber(toNumber(grandTotalRow[metricCol])) };
    }

    const pool = leafRows.length > 0 ? leafRows : rows;
    const values = pool.map((r) => toNumber(r[metricCol])).filter(Number.isFinite);
    if (values.length === 0) return null;

    const value =
      agg === "avg"
        ? values.reduce((a, b) => a + b, 0) / values.length
        : agg === "count"
          ? values.length
          : values.reduce((a, b) => a + b, 0);
    return { kind: "kpi", value: formatNumber(value) };
  }

  // chart / table: a (label, value) series grouped by the matched dimension.
  if (!dimCol) return null;
  const pool = leafRows.length > 0 ? leafRows : rows;
  const totals = new Map<string, number>();
  for (const row of pool) {
    const value = toNumber(row[metricCol]);
    if (!Number.isFinite(value)) continue;
    const label = String(row[dimCol] ?? "—");
    totals.set(label, (totals.get(label) ?? 0) + value);
  }
  if (totals.size === 0) return null;

  return {
    kind: "series",
    categoryLabel: dimCol,
    valueLabel: metricCol,
    points: [...totals.entries()].slice(0, 20).map(([label, value]) => ({ label, value })),
  };
}
