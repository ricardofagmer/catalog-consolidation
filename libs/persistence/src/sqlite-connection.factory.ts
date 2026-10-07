import { Injectable } from "@nestjs/common";
import type { DatabaseSync } from "node:sqlite";
import { isSqliteError, openConnection, readSchemaVersion, requireSchemaVersion } from "./sqlite-connection.js";

/**
 * Opens one connection per operation; the caller closes it in `finally`. The provider holds no
 * connection itself, so it is safe as a singleton.
 */
@Injectable()
export class SqliteConnectionFactory {
  open(dbPath: string): DatabaseSync {
    return openConnection(dbPath);
  }

  readSchemaVersion(db: DatabaseSync): number {
    return readSchemaVersion(db);
  }

  requireSchemaVersion(db: DatabaseSync): void {
    requireSchemaVersion(db);
  }

  isSqliteError(error: unknown): boolean {
    return isSqliteError(error);
  }
}
