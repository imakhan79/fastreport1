import net from "node:net";
import dns from "node:dns/promises";
import { Client } from "pg";
import { sanitizeIdentifier, dedupeColumnNames, inferColumnType } from "./file-import";

export class RestConnectorError extends Error {}

export type AuthType = "none" | "api_key_header" | "bearer";

export type RestConnectorConfig = {
  url: string;
  authType: AuthType;
  headerName?: string;
  responsePath?: string;
  paginated?: boolean;
  pageParam?: string;
  maxPages?: number;
};

export type RestConnectorSecret = {
  apiKey?: string;
  token?: string;
};

export type FlattenedData = { columns: string[]; rows: Record<string, unknown>[] };

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 40;
const MAX_PAGES_CAP = 20;
const FETCH_TIMEOUT_MS = 10_000;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const int = ipv4ToInt(ip);
  const ranges: [string, string][] = [
    ["0.0.0.0", "0.255.255.255"],
    ["10.0.0.0", "10.255.255.255"],
    ["127.0.0.0", "127.255.255.255"],
    ["169.254.0.0", "169.254.255.255"],
    ["172.16.0.0", "172.31.255.255"],
    ["192.168.0.0", "192.168.255.255"],
  ];
  return ranges.some(([start, end]) => int >= ipv4ToInt(start) && int <= ipv4ToInt(end));
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
  }
  return true; // Unrecognized format - block rather than risk it.
}

/**
 * Best-effort SSRF guard for a user-supplied URL this server is about to
 * fetch: rejects non-http(s) schemes and resolves the hostname, blocking
 * private/loopback/link-local addresses. Not a complete defense against a
 * DNS-rebinding race (the IP is checked here, not pinned for the actual
 * request), but it closes off the common case of pointing the connector at
 * localhost or an internal/cloud-metadata address.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RestConnectorError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RestConnectorError("URL must use http or https.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new RestConnectorError("Requests to localhost are not allowed.");
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new RestConnectorError("Could not resolve that hostname.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new RestConnectorError("This URL resolves to a private or internal address, which isn't allowed.");
  }
  return url;
}

function buildAuthHeaders(config: RestConnectorConfig, secret: RestConnectorSecret): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.authType === "api_key_header" && secret.apiKey) {
    headers[(config.headerName || "X-API-Key").trim()] = secret.apiKey;
  } else if (config.authType === "bearer" && secret.token) {
    headers.Authorization = `Bearer ${secret.token}`;
  }
  return headers;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: controller.signal });
    } catch (error) {
      throw new RestConnectorError(
        error instanceof Error && error.name === "AbortError" ? "Request timed out." : "Could not reach that URL."
      );
    }
    if (!res.ok) {
      throw new RestConnectorError(`Request failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new RestConnectorError("Response is too large (max 5MB).");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new RestConnectorError("Response was not valid JSON.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function extractArray(body: unknown, path: string | undefined): unknown[] {
  let current = body;
  if (path && path.trim()) {
    for (const key of path.split(".").filter(Boolean)) {
      if (current === null || typeof current !== "object") {
        throw new RestConnectorError(`Response path "${path}" was not found in the response.`);
      }
      current = (current as Record<string, unknown>)[key];
    }
  }
  if (!Array.isArray(current)) {
    throw new RestConnectorError(
      path ? `The value at "${path}" is not an array.` : "The response is not a JSON array - set a response path to point at one."
    );
  }
  return current;
}

function flattenRecords(records: unknown[]): FlattenedData {
  const keySet = new Set<string>();
  for (const record of records) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      for (const key of Object.keys(record as Record<string, unknown>)) {
        if (keySet.size < MAX_COLUMNS || keySet.has(key)) keySet.add(key);
      }
    }
  }
  const rawColumns = [...keySet];
  if (rawColumns.length === 0) {
    throw new RestConnectorError("No records with fields were found to import.");
  }
  const columns = dedupeColumnNames(rawColumns.map(sanitizeIdentifier));

  const rows = records.slice(0, MAX_ROWS).map((record) => {
    const src = record && typeof record === "object" && !Array.isArray(record) ? (record as Record<string, unknown>) : {};
    const row: Record<string, unknown> = {};
    rawColumns.forEach((rawKey, i) => {
      const value = src[rawKey];
      row[columns[i]] = value !== null && value !== undefined && typeof value === "object" ? JSON.stringify(value) : (value ?? null);
    });
    return row;
  });

  return { columns, rows };
}

/** Fetches (with pagination, if configured), extracts the record array, and flattens it into columns/rows. */
export async function fetchRestApiData(config: RestConnectorConfig, secret: RestConnectorSecret): Promise<FlattenedData> {
  await assertSafeUrl(config.url);
  const headers = buildAuthHeaders(config, secret);
  const maxPages = config.paginated ? Math.min(Math.max(1, config.maxPages ?? 1), MAX_PAGES_CAP) : 1;

  const allRecords: unknown[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(config.url);
    if (config.paginated && config.pageParam?.trim()) {
      url.searchParams.set(config.pageParam.trim(), String(page));
    }
    const body = await fetchJson(url.toString(), headers);
    const records = extractArray(body, config.responsePath);
    allRecords.push(...records);
    if (records.length === 0 || allRecords.length >= MAX_ROWS) break;
  }

  if (allRecords.length === 0) {
    throw new RestConnectorError("No records were found at the configured response path.");
  }

  return flattenRecords(allRecords);
}

/** Drops (if present) and recreates tableName in this app's own database, loading the given rows. */
export async function syncRestApiTable(orgId: number, tableName: string, data: FlattenedData): Promise<void> {
  const types = inferColumnType(data.columns, data.rows);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query(`DROP TABLE IF EXISTS public."${tableName}"`);
    const columnDefs = data.columns.map((c) => `"${c}" ${types[c] === "numeric" ? "numeric" : "text"}`).join(", ");
    await client.query(`CREATE TABLE public."${tableName}" (org_id bigint not null, ${columnDefs})`);

    const insertColumns = ["org_id", ...data.columns];
    const columnList = insertColumns.map((c) => `"${c}"`).join(", ");
    const BATCH_SIZE = 200;

    for (let i = 0; i < data.rows.length; i += BATCH_SIZE) {
      const batch = data.rows.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const tuples = batch.map((row, rowIndex) => {
        const rowValues = [orgId, ...data.columns.map((c) => row[c])];
        values.push(...rowValues);
        const placeholders = rowValues.map((_, colIndex) => `$${rowIndex * insertColumns.length + colIndex + 1}`);
        return `(${placeholders.join(", ")})`;
      });
      await client.query(`INSERT INTO public."${tableName}" (${columnList}) VALUES ${tuples.join(", ")}`, values);
    }
  } catch (error) {
    throw new RestConnectorError(`Failed to load data into a queryable table: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await client.end().catch(() => {});
  }
}
