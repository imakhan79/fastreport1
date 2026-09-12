import { z } from "zod";
import { callGeminiTool, AiToolCallError } from "./call-tool";

export class QueryVerificationError extends Error {}

const QueryVerificationSchema = z.object({
  confident: z.boolean(),
  confidence: z.number().min(0).max(100),
  issues: z.array(z.string()),
  reasoning: z.string(),
});

export type QueryVerification = z.infer<typeof QueryVerificationSchema>;

const VERIFICATION_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    confident: {
      type: "boolean",
      description: "True only if this SQL and its actual results genuinely and fully answer the request.",
    },
    confidence: {
      type: "number",
      description:
        "Your own independent 0-100 confidence that this query and its actual results correctly answer the request. Form your own judgment - do not simply restate the generator's stated confidence.",
    },
    issues: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific problems found: wrong table/join, wrong aggregation or grouping, wrong date range, a mismatch between what was asked and what the results actually show, results that look implausible, etc. Empty array if you find none.",
    },
    reasoning: { type: "string", description: "One or two sentences explaining your judgment." },
  },
  required: ["confident", "confidence", "issues", "reasoning"],
};

const SYSTEM_PROMPT = `You are an independent verifier in DataReportQ, an autonomous reporting platform. You did not write this SQL query - a separate generation step did, and it already reported its own confidence. Your job is to critically check that work, not to defend it or agree with it by default.

You will be given the original natural-language request, the SQL query that was generated, and a sample of the actual rows it returned. Judge, skeptically: does this query genuinely answer the request? Check the tables/columns used, the aggregation and grouping, any date filters, and whether the returned values plausibly answer what was asked - not just whether the SQL is syntactically valid or ran without error.

Call submit_verification with your own independent judgment.`;

/**
 * A second, independent model call that critiques already-generated SQL
 * and its actual result rows, rather than generating them - the point is
 * to catch a confidently-wrong answer that the generating call itself had
 * no way to notice, since self-reported confidence from the same call
 * that produced the SQL is not a check on that SQL at all.
 */
export async function verifyQueryResult(
  reportTitle: string,
  request: string,
  sql: string,
  sampleRows: Record<string, unknown>[],
  rowCount: number
): Promise<QueryVerification> {
  const input = `Report title: ${reportTitle}

Original request: ${request}

Generated SQL:
${sql}

Total rows returned: ${rowCount}
Sample of actual results (up to 10 rows):
${JSON.stringify(sampleRows.slice(0, 10), null, 2)}`;

  try {
    return await callGeminiTool({
      systemInstruction: SYSTEM_PROMPT,
      input,
      toolName: "submit_verification",
      toolDescription: "Submit your independent verification judgment.",
      toolParameters: VERIFICATION_TOOL_SCHEMA,
      schema: QueryVerificationSchema,
    });
  } catch (error) {
    throw new QueryVerificationError(error instanceof AiToolCallError ? error.message : String(error));
  }
}

const MIN_EXPECTED_BREAKDOWN_ROWS = 2;
const BREAKDOWN_RE = /\bby\s+\w+|\bper\s+\w+|\bbreakdown\b|\bcompar/i;

/** Cheap, deterministic sanity checks on the actual result set - no AI call, runs even if verifyQueryResult fails. */
export function checkResultSanity(request: string, rows: Record<string, unknown>[], rowCount: number): string[] {
  const issues: string[] = [];

  if (rowCount === 0) {
    issues.push("Query returned zero rows.");
    return issues;
  }

  if (BREAKDOWN_RE.test(request) && rowCount < MIN_EXPECTED_BREAKDOWN_ROWS) {
    issues.push(`Request implies a breakdown or comparison, but the query returned only ${rowCount} row(s).`);
  }

  if (rows.length > 0) {
    const numericColumns = Object.keys(rows[0]).filter((col) => rows.some((r) => typeof r[col] === "number"));
    for (const col of numericColumns) {
      if (rows.every((r) => r[col] === null)) issues.push(`Column "${col}" is null in every row.`);
      else if (rows.every((r) => Number(r[col]) === 0)) issues.push(`Column "${col}" is zero in every row.`);
    }
  }

  return issues;
}
