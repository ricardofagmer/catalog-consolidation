import type { DatabaseSync, StatementSync } from "node:sqlite";
import { SqliteCatalogRepository, toReviewItem } from "./sqlite-catalog-repository.js";
import {
  asRow,
  beginTransaction,
  bindText,
  readOptionalText,
  readText,
  type SqliteRow,
  type TransactionMode,
} from "./sqlite-connection.js";
import {
  REVIEW_PAGE_MAX_LIMIT,
  type CatalogRepository,
  type ReviewRecord,
  type ReviewRepository,
  type ReviewStatus,
  type ReviewUnitOfWork,
} from "@catalog/domain";

// The list use case asks for one look-ahead row past its largest page; nothing more.
const MAX_REVIEW_FETCH = REVIEW_PAGE_MAX_LIMIT + 1;

const REVIEW_COLUMNS = `r.Id, s.Name AS SellerName, r.SellerProductId, r.CandidateProductId, r.Score, r.Reason, r.Status, r.SourceName, r.SourceBrand, r.SourceCategory`;

const SELECT_REVIEWS_BY_STATUS = `SELECT ${REVIEW_COLUMNS} FROM ProductMatchReview r JOIN Seller s ON s.Id = r.SellerId WHERE r.Status = ? AND r.Id > ? ORDER BY r.Id LIMIT ?`;

const SELECT_REVIEW_BY_ID = `SELECT ${REVIEW_COLUMNS} FROM ProductMatchReview r JOIN Seller s ON s.Id = r.SellerId WHERE r.Id = ?`;

const SELECT_PRODUCT_EXISTS = `SELECT 1 FROM Product WHERE Id = ?`;

const UPDATE_REVIEW_STATUS = `UPDATE ProductMatchReview SET Status = ? WHERE Id = ? AND Status = ?`;

/** ReviewRepository over one node:sqlite connection; the unit of work owns the transaction. */
export class SqliteReviewRepository implements ReviewRepository {
  private readonly selectReviewsByStatus: StatementSync;
  private readonly selectReviewById: StatementSync;
  private readonly selectProductExists: StatementSync;
  private readonly updateReviewStatus: StatementSync;

  constructor(args: { connection: DatabaseSync }) {
    const { connection } = args;
    this.selectReviewsByStatus = connection.prepare(SELECT_REVIEWS_BY_STATUS);
    this.selectReviewById = connection.prepare(SELECT_REVIEW_BY_ID);
    this.selectProductExists = connection.prepare(SELECT_PRODUCT_EXISTS);
    this.updateReviewStatus = connection.prepare(UPDATE_REVIEW_STATUS);
  }

  listByStatus(args: { status: ReviewStatus; afterId: number; limit: number }): readonly ReviewRecord[] {
    if (!(Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= MAX_REVIEW_FETCH)) {
      throw new RangeError(`limit must be between 1 and ${String(MAX_REVIEW_FETCH)}, got ${String(args.limit)}`);
    }
    return this.selectReviewsByStatus
      .all(bindText(args.status), args.afterId, args.limit)
      .map((value) => toReviewRecord(asRow(value)));
  }

  get(args: { reviewId: number }): ReviewRecord | null {
    const value = this.selectReviewById.get(args.reviewId);
    return value === undefined ? null : toReviewRecord(asRow(value));
  }

  productExists(args: { productId: number }): boolean {
    return this.selectProductExists.get(args.productId) !== undefined;
  }

  transitionStatus(args: { reviewId: number; fromStatus: ReviewStatus; toStatus: ReviewStatus }): boolean {
    const result = this.updateReviewStatus.run(bindText(args.toStatus), args.reviewId, bindText(args.fromStatus));
    // Zero changes means another resolution already moved the row out of fromStatus.
    return Number(result.changes) === 1;
  }
}

/** One transaction on one connection for a review command; the use case ends it. */
export class SqliteReviewUnitOfWork implements ReviewUnitOfWork {
  readonly catalog: CatalogRepository;
  readonly reviews: ReviewRepository;
  private readonly connection: DatabaseSync;

  // Write paths pass "immediate"; read-only callers keep the default deferred BEGIN.
  constructor(args: { connection: DatabaseSync; mode?: TransactionMode }) {
    this.connection = args.connection;
    // Statements are prepared before BEGIN so a schema error cannot leave a transaction open.
    this.catalog = new SqliteCatalogRepository({ connection: args.connection });
    this.reviews = new SqliteReviewRepository({ connection: args.connection });
    beginTransaction(args.connection, args.mode ?? "deferred");
  }

  commit(): void {
    // node:sqlite throws when no transaction is open; Python's commit is a no-op there.
    if (this.connection.isTransaction) {
      this.connection.exec("COMMIT");
    }
  }

  rollback(): void {
    if (this.connection.isTransaction) {
      this.connection.exec("ROLLBACK");
    }
  }
}

function toReviewRecord(row: SqliteRow): ReviewRecord {
  return {
    item: toReviewItem(row),
    sourceName: readText(row, "SourceName"),
    sourceBrand: readOptionalText(row, "SourceBrand"),
    sourceCategory: readOptionalText(row, "SourceCategory"),
  };
}
