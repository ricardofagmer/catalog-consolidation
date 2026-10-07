import { ApiProperty } from "@nestjs/swagger";
import { MATCH_TYPES, type MatchType } from "@catalog/domain";

export class SellerOfferDto {
  @ApiProperty({ type: "integer", description: "Seller Offer id" })
  readonly id: number;

  @ApiProperty({ description: "Seller name" })
  readonly sellerName: string;

  @ApiProperty({ description: "The seller's own product id (SKU), opaque" })
  readonly sellerProductId: string;

  @ApiProperty({ description: "Product name exactly as the seller sent it" })
  readonly sourceName: string;

  @ApiProperty({ type: String, nullable: true, description: "Brand exactly as the seller sent it" })
  readonly sourceBrand: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Category exactly as the seller sent it" })
  readonly sourceCategory: string | null;

  @ApiProperty({
    enum: MATCH_TYPES,
    enumName: "MatchType",
    description:
      "How the offer was linked: EXACT and NORMALIZED by the consolidator, CREATED when it created the " +
      "product, REVIEWED when a reviewer linked it",
  })
  readonly matchType: MatchType;

  constructor(fields: SellerOfferDto) {
    this.id = fields.id;
    this.sellerName = fields.sellerName;
    this.sellerProductId = fields.sellerProductId;
    this.sourceName = fields.sourceName;
    this.sourceBrand = fields.sourceBrand;
    this.sourceCategory = fields.sourceCategory;
    this.matchType = fields.matchType;
  }
}

export class SellerOfferPageDto {
  @ApiProperty({ type: [SellerOfferDto], description: "At most 100 Seller Offers, in ascending id order" })
  readonly items: readonly SellerOfferDto[];

  @ApiProperty({ description: "True when the product has more than the Seller Offers listed" })
  readonly hasMore: boolean;

  constructor(fields: SellerOfferPageDto) {
    this.items = fields.items;
    this.hasMore = fields.hasMore;
  }
}

export class ProductDetailDto {
  @ApiProperty({ type: "integer", description: "Product id" })
  readonly id: number;

  @ApiProperty({ description: "Display name, as stored" })
  readonly name: string;

  @ApiProperty({ type: String, nullable: true, description: "Display brand, as stored" })
  readonly brand: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Display category, as stored" })
  readonly category: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Match key derived from the name" })
  readonly normalizedName: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Match key derived from the brand" })
  readonly normalizedBrand: string | null;

  @ApiProperty({ type: SellerOfferPageDto, description: "Seller Offers linked to this product" })
  readonly offers: SellerOfferPageDto;

  constructor(fields: ProductDetailDto) {
    this.id = fields.id;
    this.name = fields.name;
    this.brand = fields.brand;
    this.category = fields.category;
    this.normalizedName = fields.normalizedName;
    this.normalizedBrand = fields.normalizedBrand;
    this.offers = fields.offers;
  }
}
