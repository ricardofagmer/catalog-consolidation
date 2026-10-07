import { Injectable } from "@nestjs/common";
import type { DatabaseSync } from "node:sqlite";
import { SqliteUnitOfWork } from "./sqlite-catalog-repository.js";
import type { TransactionMode } from "./sqlite-connection.js";
import { SqliteReviewUnitOfWork } from "./sqlite-review-repository.js";

export interface UnitOfWorkArgs {
  readonly connection: DatabaseSync;
  readonly mode?: TransactionMode;
}

// A unit of work opens its transaction in the constructor, so it is built per operation on the
// caller's connection and never shared through the container.
@Injectable()
export class UnitOfWorkFactory {
  create(args: UnitOfWorkArgs): SqliteUnitOfWork {
    return new SqliteUnitOfWork(args);
  }
}

@Injectable()
export class ReviewUnitOfWorkFactory {
  create(args: UnitOfWorkArgs): SqliteReviewUnitOfWork {
    return new SqliteReviewUnitOfWork(args);
  }
}

