import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { callGeminiTool, AiToolCallError } from "./call-tool";
import { QUERY_PLAN_TOOL_SCHEMA, QueryPlanSchema, type QueryPlan } from "./query-schema";
import {
  validateSqlSafety,
  validateSqlSyntax,
  executeReadOnlyQuery,
  resolveConnectionString,
  QueryExecutionError,
} from "./query-executor";
import { getConfidenceThreshold } from "./confidence";
import { verifyQueryResult, checkResultSanity } from "./query-verification";
import { statusAfterQuery } from "./report-status";
import type { OrchestratorPlan } from "./orchestrator-schema";

const MAX_REGENERATE_ATTEMPTS = 1;

/** Original attempt + up to this many auto-regenerations after human rejection, before we stop looping. */
export const MAX_AUTO_QUERY_ATTEMPTS = 4;

export class QueryPipelineError extends Error {}

type SchemaTable = { name: string; columns: { name: string; type: string }[] };
type Report = Database["public"]["Tables"]["reports"]["Row"];

function buildSystemPrompt(orgId: number, tables: SchemaTable[]): string {
  const schemaDescription = tables
    .map((t) => `- ${t.name}(${t.columns.map((c) => `${c.name}: ${c.type}`).join(", ")})`)
    .join("\n");

  return `You are the Query pipeline of DataReportQ, an autonomous reporting platform.

Given a report's title and the user's original request, write a single read-only PostgreSQL SELECT statement that answers it, using ONLY this schema:
${schemaDescription}

Rules:
- Every table in this schema has an org_id column. Your query MUST include "org_id = ${orgId}" in the WHERE clause - this is a hard tenant-isolation requirement, not optional.
- Use only the tables and columns listed above. Never reference any other table.
- Use aggregation (SUM/AVG/COUNT), GROUP BY, and date filtering as needed to match the request (e.g. a month comparison needs to group by month and filter the relevant date range).
- Write a single statement only - no semicolon-separated multiple statements, no comments.
- confidence is your honest 0-100 confidence that this query correctly answers the request using only the given schema - lower it if the schema doesn't cleanly support what was asked.`;
}

async function generateQuery(
  systemPrompt: string,
  reportTitle: string,
  request: string
): Promise<QueryPlan> {
  return callGeminiTool({
    systemInstruction: systemPrompt,
    input: `Report title: ${reportTitle}\n\nOriginal request: ${request}`,
    toolName: "submit_query",
    toolDescription: "Submit the SQL query that answers this report request.",
    toolParameters: QUERY_PLAN_TOOL_SCHEMA,
    schema: QueryPlanSchema,
  });
}

async function fixQuery(
  systemPrompt: string,
  reportTitle: string,
  request: string,
  previousSql: string,
  errors: string[]
): Promise<QueryPlan> {
  return callGeminiTool({
    systemInstruction: systemPrompt,
    input: `Report title: ${reportTitle}\n\nOriginal request: ${request}\n\nYour previous query failed:\n${errors
      .map((e) => `- ${e}`)
      .join("\n")}\n\nPrevious query:\n${previousSql}\n\nSubmit a corrected query that fixes every issue above.`,
    toolName: "submit_query",
    toolDescription: "Submit the corrected SQL query.",
    toolParameters: QUERY_PLAN_TOOL_SCHEMA,
    schema: QueryPlanSchema,
  });
}

export type QueryPipelineResult = {
  query: Database["public"]["Tables"]["queries"]["Row"];
  escalated: boolean;
};

/** Generates, validates, executes, verifies, and saves one query attempt (does not touch reports.status). */
async function buildAndInsertQuery(admin: SupabaseClient<Database>, report: Report): Promise<QueryPipelineResult> {
  const { data: dataSource, error: dataSourceError } = await admin
    .from("data_sources")
    .select("*")
    .eq("org_id", report.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dataSourceError || !dataSource) {
    throw new QueryPipelineError("No data source registered for this organization.");
  }

  const schemaCache = dataSource.schema_cache as { tables: SchemaTable[] } | null;
  const tables = schemaCache?.tables ?? [];
  if (tables.length === 0) {
    throw new QueryPipelineError("Data source has no discoverable tables.");
  }
  const connectionString = resolveConnectionString(dataSource.connection_ref);
  const allowedTableNames = tables.map((t) => t.name);
  const systemPrompt = buildSystemPrompt(report.org_id, tables);
  const title = report.title ?? report.natural_language_request;

  let generated: QueryPlan;
  try {
    generated = await generateQuery(systemPrompt, title, report.natural_language_request);
  } catch (error) {
    throw new QueryPipelineError(error instanceof AiToolCallError ? error.message : String(error));
  }

  let issues = validateSqlSafety(generated.sql, report.org_id, allowedTableNames);
  if (issues.length === 0) {
    const syntaxError = await validateSqlSyntax(generated.sql, connectionString);
    if (syntaxError) issues = [`SQL syntax/plan error: ${syntaxError}`];
  }

  for (let attempt = 0; attempt < MAX_REGENERATE_ATTEMPTS && issues.length > 0; attempt++) {
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "ai",
      action: "query.validation_failed",
      entity_type: "report",
      entity_id: report.id,
      details: { issues, sql: generated.sql },
    });

    try {
      generated = await fixQuery(systemPrompt, title, report.natural_language_request, generated.sql, issues);
    } catch (error) {
      throw new QueryPipelineError(error instanceof AiToolCallError ? error.message : String(error));
    }

    issues = validateSqlSafety(generated.sql, report.org_id, allowedTableNames);
    if (issues.length === 0) {
      const syntaxError = await validateSqlSyntax(generated.sql, connectionString);
      if (syntaxError) issues = [`SQL syntax/plan error: ${syntaxError}`];
    }
  }

  let rows: Record<string, unknown>[] = [];
  let rowCount = 0;
  let executionError: string | null = null;

  if (issues.length === 0) {
    try {
      const result = await executeReadOnlyQuery(generated.sql, connectionString);
      rows = result.rows;
      rowCount = result.rowCount;
    } catch (error) {
      executionError = error instanceof QueryExecutionError ? error.message : String(error);
      issues = [`Execution error: ${executionError}`];
    }
  }

  // Independent correctness check: a second model call critiques the SQL and its
  // actual results, rather than generating them, plus free deterministic sanity
  // checks - self-reported confidence from the generating call alone is not a
  // check on that call's own output.
  let verificationConfidence: number | null = null;
  const verificationIssues: string[] = [];
  if (issues.length === 0) {
    verificationIssues.push(...checkResultSanity(report.natural_language_request, rows, rowCount));
    try {
      const verification = await verifyQueryResult(title, report.natural_language_request, generated.sql, rows, rowCount);
      verificationConfidence = verification.confidence;
      verificationIssues.push(...verification.issues);
    } catch (error) {
      console.error("Query verification failed:", error);
    }
  }

  const threshold = await getConfidenceThreshold(admin, report.org_id, "query");
  const succeeded = issues.length === 0;
  const effectiveConfidence =
    verificationConfidence !== null ? Math.min(generated.confidence, verificationConfidence) : generated.confidence;
  const escalated = !succeeded || effectiveConfidence < threshold || verificationIssues.length > 0;

  const { data: queryRow, error: queryInsertError } = await admin
    .from("queries")
    .insert({
      org_id: report.org_id,
      report_id: report.id,
      data_source_id: dataSource.id,
      natural_language_request: report.natural_language_request,
      sql_text: generated.sql,
      tables: generated.tables,
      fields: generated.fields,
      confidence: generated.confidence,
      verification_confidence: verificationConfidence,
      verification_issues: verificationIssues,
      status: succeeded ? (escalated ? "pending_review" : "executed") : "failed",
      validation_errors: issues,
      result_preview: rows as unknown as Database["public"]["Tables"]["queries"]["Insert"]["result_preview"],
      row_count: succeeded ? rowCount : null,
      executed_at: succeeded ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (queryInsertError) {
    throw new QueryPipelineError(`Failed to save query: ${queryInsertError.message}`);
  }

  if (escalated) {
    await admin.from("tasks").insert({
      org_id: report.org_id,
      report_id: report.id,
      task_type: "query_review",
      related_entity_type: "query",
      related_entity_id: queryRow.id,
      priority: succeeded ? "normal" : "high",
      status: "open",
      confidence: generated.confidence,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "system",
      action: succeeded ? "query.escalated_for_review" : "query.failed_escalated",
      entity_type: "query",
      entity_id: queryRow.id,
      details: { confidence: generated.confidence, verificationConfidence, threshold, issues, verificationIssues },
    });
  } else {
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "ai",
      action: "query.executed",
      entity_type: "query",
      entity_id: queryRow.id,
      details: { confidence: generated.confidence, verificationConfidence, threshold, row_count: rowCount },
    });
  }

  return { query: queryRow, escalated };
}

export async function runQueryPipeline(
  admin: SupabaseClient<Database>,
  report: Report,
  plan: OrchestratorPlan
): Promise<QueryPipelineResult> {
  const result = await buildAndInsertQuery(admin, report);

  await admin.from("reports").update({ status: statusAfterQuery(plan) }).eq("id", report.id);

  return result;
}

/**
 * Generates a brand-new query attempt for a report whose current query was
 * rejected - called automatically on human rejection (task-resolution.ts)
 * and available as a manual "Regenerate" action. Queries have no version
 * column (unlike designs); the report detail page and isReportReadyToGenerate
 * both already treat "the most recently inserted query row" as authoritative
 * (`order by id desc limit 1`), so a fresh row naturally supersedes the
 * rejected one without needing extra schema. Deliberately never touches
 * reports.status, for the same reason regenerateDesign() doesn't: the report
 * has typically already moved past the "querying" stage by the time a human
 * rejects a query, since query review here is advisory, not gating.
 */
export async function regenerateRejectedQuery(
  admin: SupabaseClient<Database>,
  report: Report,
  reason: "auto_rejection" | "manual"
): Promise<QueryPipelineResult | null> {
  if (reason === "auto_rejection") {
    const { count } = await admin
      .from("queries")
      .select("id", { count: "exact", head: true })
      .eq("report_id", report.id);

    if ((count ?? 0) >= MAX_AUTO_QUERY_ATTEMPTS) {
      await admin.from("audit_log").insert({
        org_id: report.org_id,
        report_id: report.id,
        actor_type: "system",
        action: "query.regeneration_limit_reached",
        entity_type: "report",
        entity_id: report.id,
        details: { attempts_tried: count },
      });
      return null;
    }
  }

  const result = await buildAndInsertQuery(admin, report);

  await admin.from("audit_log").insert({
    org_id: report.org_id,
    report_id: report.id,
    actor_type: reason === "auto_rejection" ? "system" : "user",
    action: "query.regenerated",
    entity_type: "query",
    entity_id: result.query.id,
    details: { reason },
  });

  return result;
}
