// The catalog read model the web used to own. The caller owns the connection (open, read-only
// pragma, schema check, close), so these queries never decide connection lifetime or write mode.
import { Injectable } from "@nestjs/common";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { REVIEW_PAGE_MAX_LIMIT, type ReviewRecord } from "@catalog/domain";
import { NormalizationService } from "@catalog/rules";
import {
  catalogProductToCandidate,
  toCandidateProduct,
  toProductDetail,
  toProductListRow,
  toSellerLinkRow,
  type CandidateProduct,
  type ProductDetail,
  type ProductPage,
  type ReviewView,
  type SellerLinkPage,
  type SummaryCounts,
} from "./catalog-read-model-rows.js";
import { SqliteCatalogRepository } from "./sqlite-catalog-repository.js";
import { asRow, bindOptionalText, readInteger } from "./sqlite-connection.js";

const COUNT_COLUMN = "COUNT(*)";
const SELLER_LINKS_SHOWN = 100;

const COUNT_PRODUCTS = "SELECT COUNT(*) FROM Product";
const COUNT_SELLER_LINKS = "SELECT COUNT(*) FROM SellerProduct";
const COUNT_PENDING_REVIEWS = "SELECT COUNT(*) FROM ProductMatchReview WHERE Status = 'PENDING'";

// The doubled backslash is JavaScript escaping: SQLite receives ESCAPE '\'.
const SELECT_PRODUCT_PAGE =
  "SELECT p.Id, p.Name, p.Brand, p.Category,\n" +
  "       (SELECT COUNT(*) FROM SellerProduct sp WHERE sp.ProductId = p.Id) AS SellerCount\n" +
  "FROM Product p WHERE p.Id > ? AND (? IS NULL OR p.NormalizedName LIKE ? ESCAPE '\\') ORDER BY p.Id LIMIT ?";

const SELECT_PRODUCT = "SELECT Id, Name, Brand, Category, NormalizedName, NormalizedBrand FROM Product WHERE Id = ?";

const SELECT_SELLER_LINKS =
  "SELECT Id, SellerName, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType\n" +
  "FROM SellerProduct WHERE ProductId = ? ORDER BY Id LIMIT 101";

const SELECT_CANDIDATE = "SELECT Id, Name, Brand, Category FROM Product WHERE Id = ?";

const LIKE_SPECIAL_CHARACTERS = /[%_\\]/g;

export interface ReadModelConnectionArgs {
  readonly connection: DatabaseSync;
}

export interface ListProductsArgs extends ReadModelConnectionArgs {
  readonly afterId: number;
  readonly limit: number;
  readonly query: string | null;
}

export interface ProductLookupArgs extends ReadModelConnectionArgs {
  readonly productId: number;
}

export interface ReviewViewsArgs extends ReadModelConnectionArgs {
  readonly records: readonly ReviewRecord[];
}

// Stateless: SQLite errors propagate unwrapped so the caller's error mapping sees them as-is.
@Injectable()
export class CatalogReadModel {
  constructor(private readonly normalization: NormalizationService) {}

  summary(args: ReadModelConnectionArgs): SummaryCounts {
    return {
      products: readCount(args.connection, COUNT_PRODUCTS),
      sellerLinks: readCount(args.connection, COUNT_SELLER_LINKS),
      pendingReviews: readCount(args.connection, COUNT_PENDING_REVIEWS),
    };
  }

  listProducts(args: ListProductsArgs): ProductPage {
    requirePageBounds(args);
    const normalizedQuery = args.query === null ? null : this.normalization.normalize(args.query);
    const pattern = normalizedQuery === null ? null : `%${escapeLike(normalizedQuery)}%`;
    const rows = args.connection
      .prepare(SELECT_PRODUCT_PAGE)
      // One look-ahead row tells whether a next page exists without a COUNT query.
      .all(args.afterId, bindOptionalText(pattern), bindOptionalText(pattern), args.limit + 1)
      .map((value) => toProductListRow(asRow(value)));
    const page = rows.slice(0, args.limit);
    const last = page.at(-1);
    return { rows: page, nextAfterId: rows.length > args.limit && last !== undefined ? last.id : null };
  }

  getProduct(args: ProductLookupArgs): ProductDetail | null {
    const value = args.connection.prepare(SELECT_PRODUCT).get(args.productId);
    return value === undefined ? null : toProductDetail(asRow(value));
  }

  listSellerLinks(args: ProductLookupArgs): SellerLinkPage {
    const rows = args.connection
      .prepare(SELECT_SELLER_LINKS)
      .all(args.productId)
      .map((value) => toSellerLinkRow(asRow(value)));
    return { rows: rows.slice(0, SELLER_LINKS_SHOWN), hasMore: rows.length > SELLER_LINKS_SHOWN };
  }

  reviewViews(args: ReviewViewsArgs): ReviewView[] {
    const catalog = new SqliteCatalogRepository({ connection: args.connection });
    const selectCandidate = args.connection.prepare(SELECT_CANDIDATE);
    // Bounded by the review page size (at most REVIEW_PAGE_MAX_LIMIT records).
    return args.records.map(
      (record): ReviewView => ({
        record,
        candidate: readCandidate(selectCandidate, record.item.candidateProductId),
        liveCandidates: this.readLiveCandidates(catalog, record),
      }),
    );
  }

  private readLiveCandidates(catalog: SqliteCatalogRepository, record: ReviewRecord): readonly CandidateProduct[] {
    if (record.item.status !== "PENDING" || record.item.reason !== "AMBIGUOUS") {
      return [];
    }
    const normalizedName = this.normalization.normalize(record.sourceName);
    if (normalizedName === null) {
      return [];
    }
    return catalog
      .findByNormalizedName({ normalizedName, normalizedBrand: this.normalization.normalize(record.sourceBrand) })
      .map(catalogProductToCandidate);
  }
}

function readCandidate(selectCandidate: StatementSync, productId: number | null): CandidateProduct | null {
  if (productId === null) {
    return null;
  }
  const value = selectCandidate.get(productId);
  return value === undefined ? null : toCandidateProduct(asRow(value));
}

function requirePageBounds(args: { afterId: number; limit: number }): void {
  if (!(Number.isSafeInteger(args.afterId) && args.afterId >= 0)) {
    throw new RangeError(`afterId must be a non-negative integer, got ${String(args.afterId)}`);
  }
  if (!(Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= REVIEW_PAGE_MAX_LIMIT)) {
    throw new RangeError(`limit must be between 1 and ${String(REVIEW_PAGE_MAX_LIMIT)}, got ${String(args.limit)}`);
  }
}

// Normalized text is [0-9a-z ] only, so this is defensive: the rule is "always escape".
function escapeLike(text: string): string {
  return text.replace(LIKE_SPECIAL_CHARACTERS, (character) => `\\${character}`);
}

function readCount(connection: DatabaseSync, sql: string): number {
  return readInteger(asRow(connection.prepare(sql).get()), COUNT_COLUMN);
}
