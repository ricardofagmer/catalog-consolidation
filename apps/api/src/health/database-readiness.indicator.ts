import { Injectable } from "@nestjs/common";
import { HealthIndicatorService, type HealthIndicatorResult } from "@nestjs/terminus";
import { DatabaseAccess } from "../database/index.js";
import { databaseErrorType, isDatabaseFailure } from "../errors/index.js";

export const READINESS_INDICATOR_KEY = "database";

/** Ready means the database file opens and its schema version meets REQUIRED_SCHEMA_VERSION. */
@Injectable()
export class DatabaseReadinessIndicator {
  constructor(
    private readonly database: DatabaseAccess,
    private readonly indicators: HealthIndicatorService,
  ) {}

  check(): HealthIndicatorResult<typeof READINESS_INDICATOR_KEY> {
    const indicator = this.indicators.check(READINESS_INDICATOR_KEY);
    try {
      // DatabaseAccess.read itself opens the file and enforces the schema version.
      this.database.read(() => undefined);
      return indicator.up();
    } catch (error: unknown) {
      if (isDatabaseFailure(error)) {
        return indicator.down({ errorType: databaseErrorType(error) });
      }
      throw error;
    }
  }
}
