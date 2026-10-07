import { ApiProperty } from "@nestjs/swagger";

export const RESOLVED_REVIEW_STATUSES = ["LINKED", "CREATED", "REJECTED"] as const;
export type ResolvedReviewStatus = (typeof RESOLVED_REVIEW_STATUSES)[number];

export interface ResolutionResponseFields {
  readonly reviewId: number;
  readonly status: ResolvedReviewStatus;
  readonly productId: number | null;
  readonly linkId: number | null;
}

export class ResolutionResponseDto {
  @ApiProperty({ type: "integer", description: "The resolved review queue row id", example: 1 })
  readonly reviewId: number;

  @ApiProperty({
    enum: RESOLVED_REVIEW_STATUSES,
    enumName: "ResolvedReviewStatus",
    description: "Final review status: LINKED (link-candidate, link-other), CREATED (create), REJECTED (reject)",
  })
  readonly status: ResolvedReviewStatus;

  @ApiProperty({
    type: "integer",
    nullable: true,
    description: "Product the seller SKU is now linked to (the new product for create); null on reject",
    example: 21,
  })
  readonly productId: number | null;

  @ApiProperty({
    type: "integer",
    nullable: true,
    description: "Id of the new SellerProduct link row; null on reject",
    example: 256,
  })
  readonly linkId: number | null;

  constructor(fields: ResolutionResponseFields) {
    this.reviewId = fields.reviewId;
    this.status = fields.status;
    this.productId = fields.productId;
    this.linkId = fields.linkId;
  }
}
