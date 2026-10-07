import type { DatabaseSync } from "node:sqlite";
import { Inject, Injectable } from "@nestjs/common";
import { openConnection, requireSchemaVersion } from "@catalog/persistence";
import { API_CONFIG, type ApiConfig } from "../config/index.js";

/**
 * One connection per call, closed in finally: node:sqlite is synchronous, so a request never
 * holds a connection across an await. Errors propagate unwrapped; the exception filter maps them.
 */
@Injectable()
export class DatabaseAccess {
  readonly #dbPath: string;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.#dbPath = config.dbPath;
  }

  read<T>(work: (connection: DatabaseSync) => T): T {
    return this.#withConnection({ readOnly: true, work });
  }

  write<T>(work: (connection: DatabaseSync) => T): T {
    return this.#withConnection({ readOnly: false, work });
  }

  #withConnection<T>(args: { readonly readOnly: boolean; readonly work: (connection: DatabaseSync) => T }): T {
    const connection = openConnection(this.#dbPath);
    try {
      if (args.readOnly) {
        connection.exec("PRAGMA query_only = ON");
      }
      requireSchemaVersion(connection);
      return args.work(connection);
    } finally {
      connection.close();
    }
  }
}
