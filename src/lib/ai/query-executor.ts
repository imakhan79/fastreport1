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
const CONNECT_TIMEOUT_MS = 8000;

/**
 * The built-in demo data source's connection_ref is a sentinel ("sample_sales"),
 * not a real DSN - it means "use this app's own DATABASE_URL". Anything that
 * looks like a real Postgres connection string is used as-is, so user-added
 * connectors point at their own database instead of the app's.
 */
export function resolveConnectionString(connectionRef: string | null): string {
  if (connectionRef && /^postgres(ql)?:\/\//i.test(connectionRef)) return connectionRef;
  return process.env.DATABASE_URL!;
}

/**
 * Executes AI-generated SQL inside a READ ONLY transaction with a short
 * statement timeout - the real enforcement layer, independent of whatever
 * validateSqlSafety already caught by pattern-matching.
 */
export async function executeReadOnlyQuery(
  sql: string,
  connectionString: string = process.env.DATABASE_URL!
): Promise<QueryResult> {
  const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
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
export async function validateSqlSyntax(
  sql: string,
  connectionString: string = process.env.DATABASE_URL!
): Promise<string | null> {
  const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
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

export type IntrospectedTable = { name: string; columns: { name: string; type: string }[] };

const MAX_TABLES = 30;
const MAX_COLUMNS_PER_TABLE = 40;

export class ConnectionError extends Error {}

/**
 * Connects to a candidate connection string and discovers its public-schema
 * tables/columns, in a single READ ONLY transaction with the same statement
 * timeout as real query execution. Used both to test a new connector and to
 * populate/refresh its schema_cache.
 */
export async function introspectSchema(connectionString: string): Promise<IntrospectedTable[]> {
  const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  try {
    await client.connect();
  } catch (error) {
    throw new ConnectionError(error instanceof Error ? error.message : String(error));
  }

  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    try {
      const { rows } = await client.query<{ table_name: string; column_name: string; data_type: string }>(
        `select table_name, column_name, data_type
         from information_schema.columns
         where table_schema = 'public'
         order by table_name, ordinal_position`
      );
      await client.query("COMMIT");

      const tables = new Map<string, { name: string; type: string }[]>();
      for (const row of rows) {
        if (!tables.has(row.table_name)) {
          if (tables.size >= MAX_TABLES) continue;
          tables.set(row.table_name, []);
        }
        const columns = tables.get(row.table_name)!;
        if (columns.length < MAX_COLUMNS_PER_TABLE) {
          columns.push({ name: row.column_name, type: row.data_type });
        }
      }

      return [...tables.entries()].map(([name, columns]) => ({ name, columns }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw new ConnectionError(error instanceof Error ? error.message : String(error));
    }
  } finally {
    await client.end();
  }
}
