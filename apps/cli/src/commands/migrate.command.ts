import { Injectable } from "@nestjs/common";
import {
  PythonFormat,
  SqliteConnectionFactory,
  SqliteMigrationRunner,
  type MigrationReport,
} from "@catalog/persistence";

// Only the match-keys migration backfills rows; its line carries the count (frozen stdout).
const MATCH_KEYS_MIGRATION_VERSION = 2;
const VERSION_WIDTH = 4;

@Injectable()
export class MigrateCommand {
  constructor(
    private readonly connections: SqliteConnectionFactory,
    private readonly migrations: SqliteMigrationRunner,
    private readonly pythonFormat: PythonFormat,
  ) {}

  async run(args: { db: string }): Promise<Readonly<Record<string, unknown>>> {
    // argparse's `type=Path` normalizes the path before any adapter sees it; the backup line echoes it.
    const dbPath = this.pythonFormat.pythonPathLabel(args.db);
    const connection = this.connections.open(dbPath);
    let report: MigrationReport;
    try {
      report = await this.migrations.applyPending({
        connection,
        dbPath,
        migrationsDir: this.migrations.defaultMigrationsDir(),
      });
    } finally {
      connection.close();
    }
    printMigrationReport(report);
    return { schemaVersion: report.schemaVersion, appliedCount: report.applied.length };
  }
}

function printMigrationReport(report: MigrationReport): void {
  if (report.backupPath !== null) {
    process.stdout.write(`backup: ${report.backupPath}\n`);
  }
  for (const migration of report.applied) {
    let line = `applied ${String(migration.version).padStart(VERSION_WIDTH, "0")} ${migration.name}`;
    if (migration.version === MATCH_KEYS_MIGRATION_VERSION && migration.backfilledRows !== null) {
      line += ` (backfilled ${String(migration.backfilledRows)} products)`;
    }
    process.stdout.write(line + "\n");
  }
  const suffix = report.applied.length === 0 ? " (up to date)" : "";
  process.stdout.write(`schema version: ${String(report.schemaVersion)}${suffix}\n`);
}
