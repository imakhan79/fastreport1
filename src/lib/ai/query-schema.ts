import { z } from "zod";

export const QueryPlanSchema = z.object({
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  sql: z.string().min(1),
  tables: z.array(z.string()),
  fields: z.array(z.string()),
});

export type QueryPlan = z.infer<typeof QueryPlanSchema>;

/** Function-call `parameters` schema (OpenAPI-style) mirroring QueryPlanSchema above. */
export const QUERY_PLAN_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    confidence: {
      type: "number",
      description: "0-100 confidence that this SQL correctly answers the request using only the given schema.",
    },
    reasoning: { type: "string", description: "One or two sentences on the query approach." },
    sql: {
      type: "string",
      description:
        "A single read-only PostgreSQL SELECT statement using only the given table(s) and columns. Must include a WHERE clause filtering org_id to the given org id.",
    },
    tables: {
      type: "array",
      items: { type: "string" },
      description: "Table names referenced by the query.",
    },
    fields: {
      type: "array",
      items: { type: "string" },
      description: "Column/metric names selected or aggregated by the query.",
    },
  },
  required: ["confidence", "reasoning", "sql", "tables", "fields"],
};
