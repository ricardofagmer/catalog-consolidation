import type { ProductListRow, ProductPage, SellerLinkRow, SummaryCounts } from "@catalog/persistence";
import type { ProductWithOffers } from "./catalog.service.js";
import { ProductDetailDto, SellerOfferDto, SellerOfferPageDto } from "./dto/product-detail.dto.js";
import { ProductListItemDto, ProductPageDto } from "./dto/product-page.dto.js";
import { SummaryDto } from "./dto/summary.dto.js";

export function toSummaryDto(counts: SummaryCounts): SummaryDto {
  return new SummaryDto({
    products: counts.products,
    sellerOffers: counts.sellerLinks,
    pendingReviews: counts.pendingReviews,
  });
}

export function toProductPageDto(page: ProductPage): ProductPageDto {
  return new ProductPageDto({ items: page.rows.map(toProductListItemDto), nextCursor: page.nextAfterId });
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
    sellerCount: row.sellerCount,
  });
}

function toSellerOfferDto(row: SellerLinkRow): SellerOfferDto {
  return new SellerOfferDto({
    id: row.id,
    sellerName: row.sellerName,
    sellerProductId: row.sellerProductId,
    sourceName: row.sourceName,
    sourceBrand: row.sourceBrand,
    sourceCategory: row.sourceCategory,
    matchType: row.matchType,
  });
}
