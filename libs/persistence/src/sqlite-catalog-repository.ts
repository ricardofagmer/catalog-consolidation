import type { DatabaseSync, StatementSync } from "node:sqlite";
import {
  asRow,
  beginTransaction,
  bindOptionalText,
  bindText,
  readInteger,
  readOptionalInteger,
  readOptionalReal,
  readOptionalText,
  readText,
  toRowId,
  type SqliteRow,
  type TransactionMode,
} from "./sqlite-connection.js";
import {
  BACKFILL_BATCH_SIZE,
  FUZZY_SCAN_BATCH_SIZE,
  isMatchType,
  isReviewReason,
  isReviewStatus,
  MAX_EXACT_CANDIDATES,
  type CatalogProduct,
  type CatalogRepository,
  type FuzzyCandidate,
  type NewProduct,
  type NewReviewItem,
  type NewSellerLink,
  type ProductKeySource,
  type ReviewItem,
  type SellerLink,
  type UnitOfWork,
} from "@catalog/domain";

// Frozen statements, copied verbatim from docs/specs/catalog-consolidation/tasks.md
// "SQL — repository statements" (statement terminators dropped, as in the Python adapter).
const SELECT_BY_NORMALIZED_NAME = `SELECT Id, Name, Brand, Category, NormalizedName, NormalizedBrand FROM Product
WHERE NormalizedName = ? AND (? IS NULL OR NormalizedBrand IS NULL OR NormalizedBrand = ?)
ORDER BY Id LIMIT ?`;

const SELECT_BRAND_COMPATIBLE_BATCH = `SELECT Id, NormalizedName FROM Product
WHERE NormalizedName IS NOT NULL AND (? IS NULL OR NormalizedBrand IS NULL OR NormalizedBrand = ?)
  AND Id > ?
ORDER BY Id LIMIT ?`;

const SELECT_LINK_BY_SKU = `SELECT Id, SellerName, SellerProductId, ProductId, MatchType FROM SellerProduct
WHERE SellerName = ? AND SellerProductId = ?`;

const SELECT_LINK_BY_SELLER_PRODUCT = `SELECT Id, SellerName, SellerProductId, ProductId, MatchType FROM SellerProduct
WHERE SellerName = ? AND ProductId = ?`;

const SELECT_REVIEW_BY_SKU = `SELECT Id, SellerName, SellerProductId, CandidateProductId, Score, Reason, Status
FROM ProductMatchReview WHERE SellerName = ? AND SellerProductId = ?`;

const INSERT_PRODUCT = `INSERT INTO Product (Name, Brand, Category, NormalizedName, NormalizedBrand) VALUES (?, ?, ?, ?, ?)`;

const INSERT_LINK = `INSERT INTO SellerProduct
  (SellerName, ProductId, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType)
VALUES (?, ?, ?, ?, ?, ?, ?)`;

const INSERT_REVIEW = `INSERT INTO ProductMatchReview
  (SellerName, SellerProductId, SourceName, SourceBrand, SourceCategory, CandidateProductId, Score, Reason)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const SELECT_MISSING_MATCH_KEYS_BATCH = `SELECT Id, Name, Brand FROM Product WHERE NormalizedName IS NULL AND Id > ? ORDER BY Id LIMIT ?`;

const UPDATE_MATCH_KEYS = `UPDATE Product SET NormalizedName = ?, NormalizedBrand = ? WHERE Id = ?`;

const SELECT_TOTAL_CHANGES = "SELECT total_changes() AS n";

/** CatalogRepository over one node:sqlite connection; the unit of work owns the transaction. */
export class SqliteCatalogRepository implements CatalogRepository {
  private readonly selectByNormalizedName: StatementSync;
  private readonly selectBrandCompatibleBatch: StatementSync;
  private readonly selectLinkBySku: StatementSync;
  private readonly selectLinkBySellerProduct: StatementSync;
  private readonly selectReviewBySku: StatementSync;
  private readonly insertProductStatement: StatementSync;
  private readonly insertLinkStatement: StatementSync;
  private readonly insertReviewStatement: StatementSync;
  private readonly selectMissingMatchKeysBatch: StatementSync;
  private readonly updateMatchKeys: StatementSync;

  constructor(args: { connection: DatabaseSync }) {
    const { connection } = args;
    this.selectByNormalizedName = connection.prepare(SELECT_BY_NORMALIZED_NAME);
    this.selectBrandCompatibleBatch = connection.prepare(SELECT_BRAND_COMPATIBLE_BATCH);
    this.selectLinkBySku = connection.prepare(SELECT_LINK_BY_SKU);
    this.selectLinkBySellerProduct = connection.prepare(SELECT_LINK_BY_SELLER_PRODUCT);
    this.selectReviewBySku = connection.prepare(SELECT_REVIEW_BY_SKU);
    this.insertProductStatement = connection.prepare(INSERT_PRODUCT);
    this.insertLinkStatement = connection.prepare(INSERT_LINK);
    this.insertReviewStatement = connection.prepare(INSERT_REVIEW);
    this.selectMissingMatchKeysBatch = connection.prepare(SELECT_MISSING_MATCH_KEYS_BATCH);
    this.updateMatchKeys = connection.prepare(UPDATE_MATCH_KEYS);
  }

  findByNormalizedName(args: {
    normalizedName: string;
    normalizedBrand: string | null;
  }): readonly CatalogProduct[] {
    const brand = bindOptionalText(args.normalizedBrand);
    return this.selectByNormalizedName
      .all(bindText(args.normalizedName), brand, brand, MAX_EXACT_CANDIDATES)
      .map((value) => toCatalogProduct(asRow(value)));
  }

  *listBrandCompatible(args: { normalizedBrand: string | null }): Generator<FuzzyCandidate, void, undefined> {
    const brand = bindOptionalText(args.normalizedBrand);
    let afterId = 0;
    for (;;) {
      // Each batch is fully read before yielding, so writes the caller makes between batches on
      // the same connection never interleave with an open statement.
      const rows = this.selectBrandCompatibleBatch
        .all(brand, brand, afterId, FUZZY_SCAN_BATCH_SIZE)
        .map((value) => asRow(value));
      for (const row of rows) {
        const candidate: FuzzyCandidate = {
          productId: readInteger(row, "Id"),
          normalizedName: readText(row, "NormalizedName"),
        };
        yield candidate;
      }
      const lastRow = rows.at(-1);
      if (rows.length < FUZZY_SCAN_BATCH_SIZE || lastRow === undefined) {
        return;
      }
      afterId = readInteger(lastRow, "Id");
    }
  }

  findLinkBySku(args: { sellerName: string; sellerProductId: string }): SellerLink | null {
    const value = this.selectLinkBySku.get(bindText(args.sellerName), bindText(args.sellerProductId));
    return value === undefined ? null : toSellerLink(asRow(value));
  }

  findLinkBySellerProduct(args: { sellerName: string; productId: number }): SellerLink | null {
    const value = this.selectLinkBySellerProduct.get(bindText(args.sellerName), args.productId);
    return value === undefined ? null : toSellerLink(asRow(value));
  }

  findReviewBySku(args: { sellerName: string; sellerProductId: string }): ReviewItem | null {
    const value = this.selectReviewBySku.get(bindText(args.sellerName), bindText(args.sellerProductId));
    return value === undefined ? null : toReviewItem(asRow(value));
  }

  insertProduct(product: NewProduct): number {
    const result = this.insertProductStatement.run(
      bindText(product.name),
      bindOptionalText(product.brand),
      bindOptionalText(product.category),
      bindText(product.normalizedName),
      bindOptionalText(product.normalizedBrand),
    );
    return toRowId(result.lastInsertRowid);
  }

  insertLink(link: NewSellerLink): number {
    const result = this.insertLinkStatement.run(
      bindText(link.sellerName),
      link.productId,
      bindText(link.sellerProductId),
      bindText(link.sourceName),
      bindOptionalText(link.sourceBrand),
      bindOptionalText(link.sourceCategory),
      bindText(link.matchType),
    );
    return toRowId(result.lastInsertRowid);
  }

  enqueueReview(review: NewReviewItem): number {
    const result = this.insertReviewStatement.run(
      bindText(review.sellerName),
      bindText(review.sellerProductId),
      bindText(review.sourceName),
      bindOptionalText(review.sourceBrand),
      bindOptionalText(review.sourceCategory),
      review.candidateProductId,
      review.score,
      bindText(review.reason),
    );
    return toRowId(result.lastInsertRowid);
  }

  listProductsMissingMatchKeys(args: { afterId: number; limit: number }): readonly ProductKeySource[] {
    if (!(Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= BACKFILL_BATCH_SIZE)) {
      throw new RangeError(
        `limit must be between 1 and ${String(BACKFILL_BATCH_SIZE)}, got ${String(args.limit)}`,
      );
    }
    return this.selectMissingMatchKeysBatch.all(args.afterId, args.limit).map((value) => {
      const row = asRow(value);
      const source: ProductKeySource = {
        productId: readInteger(row, "Id"),
        name: readText(row, "Name"),
        brand: readOptionalText(row, "Brand"),
      };
      return source;
    });
  }

  setMatchKeys(args: { productId: number; normalizedName: string; normalizedBrand: string | null }): void {
    this.updateMatchKeys.run(bindText(args.normalizedName), bindOptionalText(args.normalizedBrand), args.productId);
  }
}

/** One transaction on one connection; the use case decides when it ends. */
export class SqliteUnitOfWork implements UnitOfWork {
  readonly catalog: CatalogRepository;
  private readonly connection: DatabaseSync;
  private readonly selectTotalChanges: StatementSync;
  private readonly changesAtStart: number;

  // Write paths pass "immediate"; read-only callers keep the default deferred BEGIN.
  constructor(args: { connection: DatabaseSync; mode?: TransactionMode }) {
    this.connection = args.connection;
    // Statements are prepared before BEGIN so a schema error cannot leave a transaction open.
    this.catalog = new SqliteCatalogRepository({ connection: args.connection });
    this.selectTotalChanges = args.connection.prepare(SELECT_TOTAL_CHANGES);
    beginTransaction(args.connection, args.mode ?? "deferred");
    this.changesAtStart = this.readTotalChanges();
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

  rowsWritten(): number {
    return this.readTotalChanges() - this.changesAtStart;
  }

  private readTotalChanges(): number {
    return readInteger(asRow(this.selectTotalChanges.get()), "n");
  }
}

export function toReviewItem(row: SqliteRow): ReviewItem {
  const reason = row.Reason;
  const status = row.Status;
  if (!isReviewReason(reason)) {
    throw new Error("unexpected value in column ProductMatchReview.Reason");
  }
  if (!isReviewStatus(status)) {
    throw new Error("unexpected value in column ProductMatchReview.Status");
  }
  return {
    id: readInteger(row, "Id"),
    sellerName: readText(row, "SellerName"),
    sellerProductId: readText(row, "SellerProductId"),
    candidateProductId: readOptionalInteger(row, "CandidateProductId"),
    score: readOptionalReal(row, "Score"),
    reason,
    status,
  };
}

function toCatalogProduct(row: SqliteRow): CatalogProduct {
  return {
    id: readInteger(row, "Id"),
    name: readText(row, "Name"),
    brand: readOptionalText(row, "Brand"),
    category: readOptionalText(row, "Category"),
    normalizedName: readOptionalText(row, "NormalizedName"),
    normalizedBrand: readOptionalText(row, "NormalizedBrand"),
  };
}

function toSellerLink(row: SqliteRow): SellerLink {
  const matchType = row.MatchType;
  if (!isMatchType(matchType)) {
    throw new Error("unexpected value in column SellerProduct.MatchType");
  }
  return {
    id: readInteger(row, "Id"),
    sellerName: readText(row, "SellerName"),
    sellerProductId: readText(row, "SellerProductId"),
    productId: readInteger(row, "ProductId"),
    matchType,
  };
}
