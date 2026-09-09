import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { Client } from "pg";
import type { IntrospectedTable } from "./query-executor";

export class FileImportError extends Error {}

const MAX_ROWS = 5000;
const MAX_COLUMNS = 50;

export type ParsedFile = { columns: string[]; rows: Record<string, unknown>[] };

/** Parses a CSV or XLSX buffer into column headers + row objects, capped to keep the resulting table small. */
export async function parseUploadedFile(buffer: Buffer, filename: string): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(filename);

  try {
    if (isCsv) {
      await workbook.csv.read(Readable.from(buffer));
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    }
  } catch (error) {
    throw new FileImportError(
      `Could not parse "${filename}" as ${isCsv ? "CSV" : "Excel"}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Some exports put a cover/instructions/summary sheet first and the real
  // data table on a later sheet, so check every sheet and use the first one
  // where an actual header + data table can be found.
  let found: { sheet: ExcelJS.Worksheet; rowCount: number; headerRowNumber: number; rawHeaders: string[] } | null = null;
  for (const candidateSheet of workbook.worksheets) {
    const detected = findHeaderRow(candidateSheet);
    if (detected) {
      found = { sheet: candidateSheet, ...detected };
      break;
    }
  }
  if (!found) {
    throw new FileImportError("Could not find a header row.");
  }
  const { sheet, rowCount, headerRowNumber, rawHeaders } = found;

  if (rawHeaders.length > MAX_COLUMNS) {
    throw new FileImportError(`Too many columns (${rawHeaders.length}) - the limit is ${MAX_COLUMNS}.`);
  }

  const columns = dedupeColumnNames(rawHeaders.map(sanitizeIdentifier));

  const rows: Record<string, unknown>[] = [];
  for (let r = headerRowNumber + 1; r <= rowCount && rows.length < MAX_ROWS; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const record: Record<string, unknown> = {};
    let hasValue = false;
    columns.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      const value = cell.value && typeof cell.value === "object" && "result" in cell.value ? cell.value.result : cell.value;
      record[col] = value ?? null;
      if (value !== null && value !== undefined && value !== "") hasValue = true;
    });
    if (hasValue) rows.push(record);
  }

  if (rows.length === 0) {
    throw new FileImportError("File has a header row but no data rows.");
  }

  return { columns, rows };
}

const HEADER_SEARCH_LIMIT = 10;

/**
 * Scans the top of a sheet for the first row that looks like a header
 * (at least 2 filled cells) and confirms there's at least one data row
 * below it. Returns null if the sheet has no such row (e.g. it's a
 * cover/instructions sheet rather than the data table).
 */
function findHeaderRow(
  sheet: ExcelJS.Worksheet
): { rowCount: number; headerRowNumber: number; rawHeaders: string[] } | null {
  const rowCount = Math.max(sheet.rowCount ?? 0, sheet.actualRowCount ?? 0);
  if (rowCount < 1) return null;

  for (let r = 1; r <= Math.min(rowCount, HEADER_SEARCH_LIMIT); r++) {
    const candidate = sheet.getRow(r);
    const cells: string[] = [];
    candidate.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const text = String(cell.value ?? "").trim();
      if (text) cells[colNumber - 1] = text;
    });
    const filled = cells.filter(Boolean).length;
    if (filled < 2) continue;

    let hasDataBelow = false;
    for (let d = r + 1; d <= rowCount; d++) {
      if (sheet.getRow(d).cellCount > 0) {
        hasDataBelow = true;
        break;
      }
    }
    if (!hasDataBelow) continue;

    return { rowCount, headerRowNumber: r, rawHeaders: cells.map((v, i) => v || `column_${i + 1}`) };
  }
  return null;
}

function sanitizeIdentifier(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(cleaned) ? cleaned : `col_${cleaned || "unnamed"}`;
}

function dedupeColumnNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count}`;
  });
}

function inferColumnType(columns: string[], rows: Record<string, unknown>[]): Record<string, "numeric" | "text"> {
  const types: Record<string, "numeric" | "text"> = {};
  for (const col of columns) {
    const samples = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== "");
    const numericCount = samples.filter((v) => typeof v === "number" || (typeof v === "string" && Number.isFinite(Number(v)))).length;
    types[col] = samples.length > 0 && numericCount === samples.length ? "numeric" : "text";
  }
  return types;
}

/**
 * Loads a parsed file into a real Postgres table in the app's own database
 * (public schema) so the existing SQL-based query pipeline can work with it
 * exactly like any other connected data source - no separate query engine
 * needed for uploaded data.
 */
export async function createImportedDataSource(
  orgId: number,
  name: string,
  parsed: ParsedFile
): Promise<{ tableName: string; tables: IntrospectedTable[] }> {
  const tableName = `import_${orgId}_${Date.now()}`;
  const types = inferColumnType(parsed.columns, parsed.rows);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const columnDefs = parsed.columns.map((c) => `"${c}" ${types[c] === "numeric" ? "numeric" : "text"}`).join(", ");
    await client.query(`CREATE TABLE public."${tableName}" (org_id bigint not null, ${columnDefs})`);

    const insertColumns = ["org_id", ...parsed.columns];
    const columnList = insertColumns.map((c) => `"${c}"`).join(", ");
    const BATCH_SIZE = 200;

    for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
      const batch = parsed.rows.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const tuples = batch.map((row, rowIndex) => {
        const rowValues = [orgId, ...parsed.columns.map((c) => row[c])];
        values.push(...rowValues);
        const placeholders = rowValues.map((_, colIndex) => `$${rowIndex * insertColumns.length + colIndex + 1}`);
        return `(${placeholders.join(", ")})`;
      });
      await client.query(
        `INSERT INTO public."${tableName}" (${columnList}) VALUES ${tuples.join(", ")}`,
        values
      );
    }
  } catch (error) {
    await client.query(`DROP TABLE IF EXISTS public."${tableName}"`).catch(() => {});
    throw new FileImportError(
      `Failed to load file into a queryable table: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    await client.end();
  }

  return {
    tableName,
    tables: [
      {
        name: tableName,
        columns: [
          { name: "org_id", type: "bigint" },
          ...parsed.columns.map((c) => ({ name: c, type: types[c] === "numeric" ? "numeric" : "text" })),
        ],
      },
    ],
  };
}
