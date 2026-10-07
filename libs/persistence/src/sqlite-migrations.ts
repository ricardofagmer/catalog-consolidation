import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { backup, type DatabaseSync } from "node:sqlite";
import { Injectable } from "@nestjs/common";
import { BACKFILL_BATCH_SIZE, MigrationError } from "@catalog/domain";
import { NormalizationService } from "@catalog/rules";
import { discover, readVerifiedScript, verifyApplied, type MigrationFile } from "./migration-files.js";
import {
  asRow,
  beginTransaction,
  readInteger,
  readSchemaVersion,
  readText,
  type SqliteRow,
} from "./sqlite-connection.js";

const SELLER_PRODUCT_REBUILD_VERSION = 1;
const MATCH_KEYS_VERSION = 2;
// AUTOINCREMENT ids start at 1, so 0 sits below every row of the keyset scan.
const KEYSET_START = 0;
const MIGRATIONS_DIR_ENV = "CATALOG_MIGRATIONS_DIR";

const CREATE_SCHEMA_VERSION = `
CREATE TABLE IF NOT EXISTS SchemaVersion (
  Version   INTEGER PRIMARY KEY,
  Name      TEXT NOT NULL,
  Checksum  TEXT NOT NULL,
  AppliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;
const SELECT_TABLE = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?";
const SELECT_APPLIED = "SELECT Version, Checksum FROM SchemaVersion ORDER BY Version";
const INSERT_APPLIED = "INSERT INTO SchemaVersion (Version, Name, Checksum) VALUES (?, ?, ?)";
const COUNT_SELLER_PRODUCTS = "SELECT COUNT(*) FROM SellerProduct";
const COUNT_COLUMN = "COUNT(*)";
const SELECT_PRODUCT_BATCH = "SELECT Id, Name, Brand FROM Product WHERE Id > ? ORDER BY Id LIMIT ?";
const UPDATE_MATCH_KEYS = "UPDATE Product SET NormalizedName = ?, NormalizedBrand = ? WHERE Id = ?";

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly backfilledRows: number | null;
}

export interface MigrationReport {
  readonly backupPath: string | null;
  readonly applied: readonly AppliedMigration[];
  readonly schemaVersion: number;
}

export interface MigrationTarget {
  readonly connection: DatabaseSync;
  readonly migrationsDir?: string;
}

export interface MigrationRun extends MigrationTarget {
  readonly dbPath: string;
}

export function defaultMigrationsDir(): string {
  const configured = process.env[MIGRATIONS_DIR_ENV];
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  // CommonJS output has no module URL, so __dirname locates this file. It compiles to
  // libs/persistence/dist/sqlite-migrations.js: three levels up is the repo root.
  return join(__dirname, "..", "..", "..", "migrations");
}

/**
 * Stateless provider: each call builds a session over the caller's connection, which the caller
 * opens and closes. `migrationsDir` defaults to defaultMigrationsDir().
 */
@Injectable()
export class SqliteMigrationRunner {
  constructor(private readonly normalization: NormalizationService) {}

  defaultMigrationsDir(): string {
    return defaultMigrationsDir();
  }

  /** Read-only: discovers files, verifies applied checksums, returns what is left. */
  pending(args: MigrationTarget): readonly MigrationFile[] {
    // dbPath is only used to name the backup, which a read-only pass never takes.
    return this.#session({ ...args, dbPath: "" }).pending();
  }

  applyPending(args: MigrationRun): Promise<MigrationReport> {
    return this.#session(args).applyPending();
  }

  #session(args: MigrationRun): MigrationSession {
    return new MigrationSession({
      connection: args.connection,
      dbPath: args.dbPath,
      migrationsDir: args.migrationsDir ?? defaultMigrationsDir(),
      normalization: this.normalization,
    });
  }
}

/** One migration run over one connection; built per operation by SqliteMigrationRunner. */
class MigrationSession {
  readonly #connection: DatabaseSync;
  readonly #dbPath: string;
  readonly #migrationsDir: string;
  readonly #normalization: NormalizationService;

  constructor(args: {
    readonly connection: DatabaseSync;
    readonly dbPath: string;
    readonly migrationsDir: string;
    readonly normalization: NormalizationService;
  }) {
    this.#connection = args.connection;
    this.#dbPath = args.dbPath;
    this.#migrationsDir = args.migrationsDir;
    this.#normalization = args.normalization;
  }

  /** Read-only: discovers files, verifies applied checksums, returns what is left. */
  pending(): readonly MigrationFile[] {
    const files = discover(this.#migrationsDir);
    const applied = this.#appliedChecksums();
    verifyApplied(files, applied);
    return files.filter((migration) => !applied.has(migration.version));
  }

  async applyPending(): Promise<MigrationReport> {
    const pending = this.pending();
    if (pending.length === 0) {
      return { backupPath: null, applied: [], schemaVersion: readSchemaVersion(this.#connection) };
    }
    const backupPath = await this.#backup();
    const applied = pending.map((migration) => this.#apply(migration));
    return { backupPath, applied, schemaVersion: readSchemaVersion(this.#connection) };
  }

  #appliedChecksums(): ReadonlyMap<number, string> {
    const applied = new Map<number, string>();
    if (this.#connection.prepare(SELECT_TABLE).get("SchemaVersion") === undefined) {
      return applied;
    }
    for (const value of this.#connection.prepare(SELECT_APPLIED).all()) {
      const row = asRow(value);
      applied.set(readInteger(row, "Version"), readText(row, "Checksum"));
    }
    return applied;
  }

  async #backup(): Promise<string> {
    // Migrations are forward-only; this file is the recovery path if one goes wrong.
    const backupPath = join(dirname(this.#dbPath), `${basename(this.#dbPath)}.pre-migrate-${backupStamp(new Date())}.bak`);
    if (existsSync(backupPath)) {
      throw new Error(`refusing to overwrite existing backup: ${backupPath}`);
    }
    await backup(this.#connection, backupPath);
    return backupPath;
  }

  #apply(migration: MigrationFile): AppliedMigration {
    const script = readVerifiedScript(migration);
    beginTransaction(this.#connection);
    try {
      this.#connection.exec(CREATE_SCHEMA_VERSION);
      const rowsBefore =
        migration.version === SELLER_PRODUCT_REBUILD_VERSION ? this.#countSellerProducts() : null;
      this.#connection.exec(script);
      if (rowsBefore !== null) {
        this.#ensureSellerProductsPreserved(rowsBefore);
      }
      const backfilledRows = migration.version === MATCH_KEYS_VERSION ? this.#backfillMatchKeys() : null;
      this.#connection.prepare(INSERT_APPLIED).run(migration.version, migration.name, migration.checksum);
      this.#connection.exec("COMMIT");
      return { version: migration.version, name: migration.name, backfilledRows };
    } catch (error) {
      // node:sqlite throws on ROLLBACK when SQLite already ended the transaction itself.
      if (this.#connection.isTransaction) {
        this.#connection.exec("ROLLBACK");
      }
      throw error;
    }
  }

  #countSellerProducts(): number {
    const row = this.#connection.prepare(COUNT_SELLER_PRODUCTS).get();
    return row === undefined ? 0 : readInteger(asRow(row), COUNT_COLUMN);
  }

  #ensureSellerProductsPreserved(rowsBefore: number): void {
    // 0001 copies links with an inner JOIN to Product: an orphan link would vanish silently.
    const rowsAfter = this.#countSellerProducts();
    if (rowsAfter !== rowsBefore) {
      throw new MigrationError({
        code: "rows_lost",
        detail:
          `row count mismatch in migration ${formatVersion(SELLER_PRODUCT_REBUILD_VERSION)}: ` +
          `SellerProduct had ${String(rowsBefore)} rows before and ${String(rowsAfter)} after; ` +
          "orphan links reference a missing Product. Rolled back.",
      });
    }
  }

  #backfillMatchKeys(): number {
    const selectBatch = this.#connection.prepare(SELECT_PRODUCT_BATCH);
    const update = this.#connection.prepare(UPDATE_MATCH_KEYS);
    let afterId = KEYSET_START;
    let updated = 0;
    for (;;) {
      const rows = selectBatch.all(afterId, BACKFILL_BATCH_SIZE);
      if (rows.length === 0) {
        return updated;
      }
      for (const value of rows) {
        const row = asRow(value);
        const productId = readInteger(row, "Id");
        update.run(
          this.#normalization.normalize(textOrNull(row, "Name")),
          this.#normalization.normalize(textOrNull(row, "Brand")),
          productId,
        );
        updated += 1;
        afterId = productId;
      }
    }
  }
}

// A non-text Name or Brand normalizes as missing, as in the Python runner.
function textOrNull(row: SqliteRow, column: string): string | null {
  const value = row[column];
  return typeof value === "string" ? value : null;
}

/** UTC `yyyymmddThhmmssZ`, the same stamp as Python's `%Y%m%dT%H%M%SZ`. */
function backupStamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${String(now.getUTCFullYear()).padStart(4, "0")}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

function formatVersion(version: number): string {
  return String(version).padStart(4, "0");
}

