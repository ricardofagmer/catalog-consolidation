import type {
  ProductListRow,
  ProductPage,
  SellerLinkListPage,
  SellerLinkListRow,
  SellerLinkRow,
  SellerRow,
  SummaryCounts,
} from "@catalog/persistence";
import type { ProductWithOffers } from "./catalog.service.js";
import { ProductDetailDto, SellerOfferDto, SellerOfferPageDto } from "./dto/product-detail.dto.js";
import { ProductListItemDto, ProductPageDto } from "./dto/product-page.dto.js";
import { SellerLinkListItemDto, SellerLinkListPageDto } from "./dto/seller-link-list.dto.js";
import { SellerDto, SellerListDto } from "./dto/seller-list.dto.js";
import { SummaryDto } from "./dto/summary.dto.js";

export function toSummaryDto(counts: SummaryCounts): SummaryDto {
  return new SummaryDto({
    products: counts.products,
    sellerOffers: counts.sellerLinks,
    pendingReviews: counts.pendingReviews,
  });
}

export function toSellerListDto(rows: readonly SellerRow[]): SellerListDto {
  return new SellerListDto({ items: rows.map((row) => new SellerDto({ id: row.id, name: row.name })) });
}

export function toProductPageDto(page: ProductPage): ProductPageDto {
  return new ProductPageDto({
    items: page.rows.map(toProductListItemDto),
    nextCursor: page.nextAfterId,
    nextOffset: page.nextOffset,
  });
}

export function toSellerLinkListPageDto(page: SellerLinkListPage): SellerLinkListPageDto {
  return new SellerLinkListPageDto({ items: page.rows.map(toSellerLinkListItemDto), nextCursor: page.nextAfterId });
}

function toSellerLinkListItemDto(row: SellerLinkListRow): SellerLinkListItemDto {
  return new SellerLinkListItemDto({
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    sellerName: row.sellerName,
    sellerProductId: row.sellerProductId,
    matchType: row.matchType,
  });
}

export function toProductDetailDto(view: ProductWithOffers): ProductDetailDto {
  const { product, offers } = view;
  return new ProductDetailDto({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    normalizedName: product.normalizedName,
    normalizedBrand: product.normalizedBrand,
    offers: new SellerOfferPageDto({ items: offers.rows.map(toSellerOfferDto), hasMore: offers.hasMore }),
  });
}

function toProductListItemDto(row: ProductListRow): ProductListItemDto {
  return new ProductListItemDto({
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    sellerNames: row.sellerNames,
  });
}

export function toSellerOfferDto(row: SellerLinkRow): SellerOfferDto {
  return new SellerOfferDto({
    id: row.id,
    sellerName: row.sellerName,
    sellerProductId: row.sellerProductId,
    matchType: row.matchType,
  });
}
