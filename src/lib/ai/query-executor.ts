import { Client } from "pg";

export class QuerySecurityError extends Error {}
export class QueryExecutionError extends Error {}

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|call|execute|vacuum|merge|comment|security\s+label)\b/i;

/**
 * Regex-based allowlist check, not a real SQL parser - good enough to
 * reject obviously out-of-scope table references, not a substitute for
 * the READ ONLY transaction below, which is the actual security boundary.
 */
const CLAUSE_BOUNDARY =
  "where|group\\s+by|order\\s+by|having|limit|offset|left|right|inner|outer|cross|natural|join|on|window|union|except|intersect|;|$";

function extractReferencedTables(sql: string): string[] {
  const tables = new Set<string>();
  const clauseRe = new RegExp(`\\b(?:from|join)\\s+([\\s\\S]*?)(?=\\b(?:${CLAUSE_BOUNDARY})\\b)`, "gi");

  for (const match of sql.matchAll(clauseRe)) {
    for (const part of match[1].split(",")) {
      const tableMatch = part.trim().match(/^([a-zA-Z_][a-zA-Z0-9_.]*)/);
      if (!tableMatch) continue;
      const name = tableMatch[1].split(".").pop()!;
      tables.add(name.toLowerCase());
    }
  }
  return [...tables];
}

export function validateSqlSafety(
  sql: string,
  orgId: number,
  allowedTables: string[]
): string[] {
  const issues: string[] = [];
  const trimmed = sql.trim();

  if (!/^(select|with)\b/i.test(trimmed)) {
    issues.push("Query must be a read-only SELECT/WITH statement.");
  }

  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    issues.push("Multiple statements are not allowed.");
  }

  if (FORBIDDEN_KEYWORDS.test(trimmed)) {
    issues.push("Query contains a forbidden write/DDL keyword.");
  }

  const referencedTables = extractReferencedTables(trimmed);
  const allowedSet = new Set(allowedTables.map((t) => t.toLowerCase()));
  for (const table of referencedTables) {
    if (!allowedSet.has(table)) {
      issues.push(`Query references table "${table}", which is not in this data source's allowlist.`);
    }
  }

  if (!new RegExp(`org_id\\s*=\\s*${orgId}\\b`).test(trimmed)) {
    issues.push(`Query must filter on org_id = ${orgId} for tenant isolation.`);
  }

  return issues;
}

export type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };

const MAX_PREVIEW_ROWS = 50;
const STATEMENT_TIMEOUT_MS = 5000;

/**
 * Executes AI-generated SQL inside a READ ONLY transaction with a short
 * statement timeout - the real enforcement layer, independent of whatever
 * validateSqlSafety already caught by pattern-matching.
 */
export async function executeReadOnlyQuery(sql: string): Promise<QueryResult> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    try {
      const result = await client.query(sql);
      await client.query("COMMIT");
      return {
        rows: result.rows.slice(0, MAX_PREVIEW_ROWS),
        rowCount: result.rowCount ?? result.rows.length,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw new QueryExecutionError(error instanceof Error ? error.message : String(error));
    }
  } finally {
    await client.end();
  }
}

/** Syntax/plan check without executing - catches malformed SQL before real execution. */
export async function validateSqlSyntax(sql: string): Promise<string | null> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    try {
      await client.query(`EXPLAIN ${sql}`);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
    }
  } finally {
    await client.end();
  }
}
