import { ApiProperty } from "@nestjs/swagger";
import { MATCH_TYPES, type MatchType } from "@catalog/domain";

export class SellerLinkListItemDto {
  @ApiProperty({ type: "integer", description: "Seller link id (SellerOffer.id)" })
  readonly id: number;

  @ApiProperty({ type: "integer", description: "Id of the linked product" })
  readonly productId: number;

  @ApiProperty({ description: "Display name of the linked product, as stored" })
  readonly productName: string;

  @ApiProperty({ description: "Seller name" })
  readonly sellerName: string;

  @ApiProperty({ description: "The seller's own product id (SKU), opaque" })
  readonly sellerProductId: string;

  @ApiProperty({
    enum: MATCH_TYPES,
    enumName: "MatchType",
    description:
      "How the offer was linked: EXACT and NORMALIZED by the consolidator, CREATED when it created the " +
      "product, REVIEWED when a reviewer linked it",
  })
  readonly matchType: MatchType;

  constructor(fields: SellerLinkListItemDto) {
    this.id = fields.id;
    this.productId = fields.productId;
    this.productName = fields.productName;
    this.sellerName = fields.sellerName;
    this.sellerProductId = fields.sellerProductId;
    this.matchType = fields.matchType;
  }
}

export class SellerLinkListPageDto {
  @ApiProperty({ type: [SellerLinkListItemDto], description: "Seller links in ascending link id order" })
  readonly items: readonly SellerLinkListItemDto[];

  @ApiProperty({
    type: "integer",
    nullable: true,
    description: "Pass as `after` to read the next page; null on the last page",
  })
  readonly nextCursor: number | null;

  constructor(fields: SellerLinkListPageDto) {
    this.items = fields.items;
    this.nextCursor = fields.nextCursor;
  }
}
