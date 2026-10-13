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
  readonly sellerNames: readonly string[];
}

export interface ProductPage {
  readonly rows: readonly ProductListRow[];
  // Set only for the id-ascending keyset order; every order also reports nextOffset.
  readonly nextAfterId: number | null;
  readonly nextOffset: number | null;
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
  readonly matchType: MatchType;
}

export interface SellerLinkPage {
  readonly rows: readonly SellerLinkRow[];
  readonly hasMore: boolean;
}

export interface SellerLinkListRow {
  readonly id: number;
  readonly productId: number;
  readonly productName: string;
  readonly sellerName: string;
  readonly sellerProductId: string;
  readonly matchType: MatchType;
}

export interface SellerLinkListPage {
  readonly rows: readonly SellerLinkListRow[];
  readonly nextAfterId: number | null;
}

export interface SellerRow {
  readonly id: number;
  readonly name: string;
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
    sellerNames: readTextList(row, "SellerNames"),
  };
}

function readTextList(row: SqliteRow, column: string): readonly string[] {
  const parsed: unknown = JSON.parse(readText(row, column));
  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === "string")) {
    throw new Error(`unexpected value in column ${column}`);
  }
  return parsed;
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
  return {
    id: readInteger(row, "Id"),
    sellerName: readText(row, "SellerName"),
    sellerProductId: readText(row, "SellerProductId"),
    matchType: readMatchType(row),
  };
}

export function toSellerLinkListRow(row: SqliteRow): SellerLinkListRow {
  return {
    id: readInteger(row, "Id"),
    productId: readInteger(row, "ProductId"),
    productName: readText(row, "ProductName"),
    sellerName: readText(row, "SellerName"),
    sellerProductId: readText(row, "SellerProductId"),
    matchType: readMatchType(row),
  };
}

function readMatchType(row: SqliteRow): MatchType {
  const matchType = row.MatchType;
  if (!isMatchType(matchType)) {
    throw new Error("unexpected value in column SellerProduct.MatchType");
  }
  return matchType;
}

export function toSellerRow(row: SqliteRow): SellerRow {
  return { id: readInteger(row, "Id"), name: readText(row, "Name") };
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
