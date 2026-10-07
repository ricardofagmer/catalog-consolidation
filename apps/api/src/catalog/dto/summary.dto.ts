import { ApiProperty } from "@nestjs/swagger";

export class SummaryDto {
  @ApiProperty({ type: "integer", description: "Products in the catalog", example: 976 })
  readonly products: number;

  @ApiProperty({ type: "integer", description: "Seller Offers linked to catalog products", example: 255 })
  readonly sellerOffers: number;

  @ApiProperty({ type: "integer", description: "Review queue items still PENDING", example: 2 })
  readonly pendingReviews: number;

  constructor(fields: SummaryDto) {
    this.products = fields.products;
    this.sellerOffers = fields.sellerOffers;
    this.pendingReviews = fields.pendingReviews;
  }
}
