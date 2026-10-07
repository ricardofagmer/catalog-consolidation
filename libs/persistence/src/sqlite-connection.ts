import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DatabaseFileError, REQUIRED_SCHEMA_VERSION } from "@catalog/domain";

const BUSY_TIMEOUT_MS = 5000;
const MAIN_DATABASE_NAME = "main";
const SQLITE_ERROR_CODE = "ERR_SQLITE_ERROR";

/** A row as node:sqlite returns it (null prototype); every column is narrowed before use. */
export type SqliteRow = Readonly<Record<string, unknown>>;

export function openConnection(dbPath: string): DatabaseSync {
  // new DatabaseSync would silently create an empty database for a mistyped path.
  if (statSync(dbPath, { throwIfNoEntry: false })?.isFile() !== true) {
    throw new DatabaseFileError({ code: "not_found", detail: `database file not found: ${dbPath}` });
  }
  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true, timeout: BUSY_TIMEOUT_MS });
  // Explicit PRAGMAs mirror the Python adapter; they run in autocommit, where foreign_keys takes
  // effect (it is a no-op inside an open transaction). PRAGMA values cannot be bound parameters,
  // so 5000 is written out and must stay equal to BUSY_TIMEOUT_MS.
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

export function readSchemaVersion(db: DatabaseSync): number {
  const table = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("SchemaVersion");
  if (table === undefined) {
    return 0;
  }
  const row = asRow(db.prepare("SELECT MAX(Version) AS Version FROM SchemaVersion").get());
  return readOptionalInteger(row, "Version") ?? 0;
}

export function requireSchemaVersion(db: DatabaseSync): void {
  const current = readSchemaVersion(db);
  if (current < REQUIRED_SCHEMA_VERSION) {
    throw new DatabaseFileError({
      code: "schema_outdated",
      detail:
        `schema version ${String(current)} < required ${String(REQUIRED_SCHEMA_VERSION)}; ` +
        `run: catalog-consolidation migrate --db ${mainDatabasePath(db)}`,
    });
  }
}

function mainDatabasePath(db: DatabaseSync): string {
  for (const value of db.prepare("PRAGMA database_list").all()) {
    const row = asRow(value);
    if (readText(row, "name") === MAIN_DATABASE_NAME) {
      return readText(row, "file");
    }
  }
  return "<path>";
}

/**
 * "immediate" takes the write lock at BEGIN, so a concurrent writer is waited on through
 * busy_timeout. A deferred BEGIN that reads first must upgrade SHARED to RESERVED on its first
 * write, and SQLite returns SQLITE_BUSY for that upgrade at once, skipping the busy handler.
 */
export type TransactionMode = "deferred" | "immediate";

export function beginTransaction(db: DatabaseSync, mode: TransactionMode = "deferred"): void {
  if (mode === "immediate") {
    db.exec("BEGIN IMMEDIATE");
  } else {
    db.exec("BEGIN");
  }
}

export function isSqliteError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === SQLITE_ERROR_CODE;
}

// Python raises UnicodeEncodeError when binding a lone surrogate; node:sqlite would store it
// silently, so text parameters are checked before binding.
export function bindText(value: string): string {
  if (!value.isWellFormed()) {
    throw new Error("text parameter is not well-formed UTF-16");
  }
  return value;
}

export function bindOptionalText(value: string | null): string | null {
  return value === null ? null : bindText(value);
}

function isRow(value: unknown): value is SqliteRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRow(value: unknown): SqliteRow {
  if (!isRow(value)) {
    throw new Error("unexpected row shape");
  }
  return value;
}

// Mismatch errors name the column, never the value: a value may be seller-supplied text.
function unexpectedValue(column: string): Error {
  return new Error(`unexpected value in column ${column}`);
}

export function readInteger(row: SqliteRow, column: string): number {
  const value = row[column];
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw unexpectedValue(column);
}

export function readOptionalInteger(row: SqliteRow, column: string): number | null {
  return row[column] === null ? null : readInteger(row, column);
}

export function readText(row: SqliteRow, column: string): string {
  const value = row[column];
  if (typeof value === "string") {
    return value;
  }
  throw unexpectedValue(column);
}

export function readOptionalText(row: SqliteRow, column: string): string | null {
  return row[column] === null ? null : readText(row, column);
}

export function readOptionalReal(row: SqliteRow, column: string): number | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  throw unexpectedValue(column);
}

export function toRowId(value: number | bigint): number {
  const rowId = typeof value === "bigint" ? Number(value) : value;
  if (Number.isSafeInteger(rowId) && BigInt(rowId) === BigInt(value)) {
    return rowId;
  }
  throw new Error("row id is not a safe integer");
}
