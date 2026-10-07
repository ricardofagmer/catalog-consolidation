// Read-model shapes and row mappers moved verbatim from the web's catalog-db module.
import { isMatchType, type CatalogProduct, type MatchType, type ReviewRecord } from "@catalog/domain";
import { readInteger, readOptionalText, readText, type SqliteRow } from "./sqlite-connection.js";

export interface SummaryCounts {
  readonly products: number;
  readonly sellerLinks: number;
  readonly pendingReviews: number;
}

export interface ProductListRow {
  readonly id: number;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly sellerCount: number;
}

export interface ProductPage {
  readonly rows: readonly ProductListRow[];
  readonly nextAfterId: number | null;
}

export interface ProductDetail {
  readonly id: number;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly normalizedName: string | null;
  readonly normalizedBrand: string | null;
}

export interface SellerLinkRow {
  readonly id: number;
  readonly sellerName: string;
  readonly sellerProductId: string;
  readonly sourceName: string;
  readonly sourceBrand: string | null;
  readonly sourceCategory: string | null;
  readonly matchType: MatchType;
}

export interface SellerLinkPage {
  readonly rows: readonly SellerLinkRow[];
  readonly hasMore: boolean;
}

export interface CandidateProduct {
  readonly id: number;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
}

export interface ReviewView {
  readonly record: ReviewRecord;
  readonly candidate: CandidateProduct | null;
  readonly liveCandidates: readonly CandidateProduct[];
}

export function toProductListRow(row: SqliteRow): ProductListRow {
  return {
    id: readInteger(row, "Id"),
    name: readText(row, "Name"),
    brand: readOptionalText(row, "Brand"),
    category: readOptionalText(row, "Category"),
    sellerCount: readInteger(row, "SellerCount"),
  };
}

export function toProductDetail(row: SqliteRow): ProductDetail {
  return {
    id: readInteger(row, "Id"),
    name: readText(row, "Name"),
    brand: readOptionalText(row, "Brand"),
    category: readOptionalText(row, "Category"),
    normalizedName: readOptionalText(row, "NormalizedName"),
    normalizedBrand: readOptionalText(row, "NormalizedBrand"),
  };
}

export function toSellerLinkRow(row: SqliteRow): SellerLinkRow {
  const matchType = row.MatchType;
  if (!isMatchType(matchType)) {
    throw new Error("unexpected value in column SellerProduct.MatchType");
  }
  return {
    id: readInteger(row, "Id"),
    sellerName: readText(row, "SellerName"),
    sellerProductId: readText(row, "SellerProductId"),
    sourceName: readText(row, "SourceName"),
    sourceBrand: readOptionalText(row, "SourceBrand"),
    sourceCategory: readOptionalText(row, "SourceCategory"),
    matchType,
  };
}

export function toCandidateProduct(row: SqliteRow): CandidateProduct {
  return {
    id: readInteger(row, "Id"),
    name: readText(row, "Name"),
    brand: readOptionalText(row, "Brand"),
    category: readOptionalText(row, "Category"),
  };
}

export function catalogProductToCandidate(product: CatalogProduct): CandidateProduct {
  return { id: product.id, name: product.name, brand: product.brand, category: product.category };
}
