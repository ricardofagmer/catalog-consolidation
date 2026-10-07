import { ApiProperty } from "@nestjs/swagger";
import { REVIEW_REASONS, REVIEW_STATUSES, type ReviewReason, type ReviewStatus } from "@catalog/domain";

export class CandidateProductDto {
  @ApiProperty({ type: "integer", description: "Product id" })
  readonly id: number;

  @ApiProperty({ description: "Display name, as stored" })
  readonly name: string;

  @ApiProperty({ type: String, nullable: true, description: "Display brand, as stored" })
  readonly brand: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Display category, as stored" })
  readonly category: string | null;

  constructor(fields: CandidateProductDto) {
    this.id = fields.id;
    this.name = fields.name;
    this.brand = fields.brand;
    this.category = fields.category;
  }
}

export class ReviewItemDto {
  @ApiProperty({ type: "integer", description: "Review id; pass it to the resolution endpoint" })
  readonly id: number;

  @ApiProperty({ enum: REVIEW_STATUSES, enumName: "ReviewStatus", description: "Queue status" })
  readonly status: ReviewStatus;

  @ApiProperty({
    enum: REVIEW_REASONS,
    enumName: "ReviewReason",
    description: "FUZZY: one close but inexact name match; AMBIGUOUS: several products share the match key",
  })
  readonly reason: ReviewReason;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Name similarity to the candidate, rounded half-to-even to 4 decimals; null when not scored",
    example: 0.9091,
  })
  readonly similarity: number | null;

  @ApiProperty({ description: "Seller name, as sent" })
  readonly sellerName: string;

  @ApiProperty({ description: "The seller's own product id (SKU), as sent" })
  readonly sellerProductId: string;

  @ApiProperty({ description: "Product name, as sent" })
  readonly sourceName: string;

  @ApiProperty({ type: String, nullable: true, description: "Brand, as sent" })
  readonly sourceBrand: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Category, as sent" })
  readonly sourceCategory: string | null;

  @ApiProperty({
    type: "integer",
    nullable: true,
    description: "Product the consolidator proposed; null for AMBIGUOUS items",
  })
  readonly candidateProductId: number | null;

  @ApiProperty({
    type: CandidateProductDto,
    nullable: true,
    description: "The proposed product as it is now; null when none was proposed or it no longer exists",
  })
  readonly candidate: CandidateProductDto | null;

  @ApiProperty({
    type: [CandidateProductDto],
    description: "Every product currently sharing the item's match key; filled only for PENDING AMBIGUOUS items",
  })
  readonly liveCandidates: readonly CandidateProductDto[];

  constructor(fields: ReviewItemDto) {
    this.id = fields.id;
    this.status = fields.status;
    this.reason = fields.reason;
    this.similarity = fields.similarity;
    this.sellerName = fields.sellerName;
    this.sellerProductId = fields.sellerProductId;
    this.sourceName = fields.sourceName;
    this.sourceBrand = fields.sourceBrand;
    this.sourceCategory = fields.sourceCategory;
    this.candidateProductId = fields.candidateProductId;
    this.candidate = fields.candidate;
    this.liveCandidates = fields.liveCandidates;
  }
}

export class ReviewPageDto {
  @ApiProperty({ type: [ReviewItemDto], description: "Reviews in ascending id order" })
  readonly items: readonly ReviewItemDto[];

  @ApiProperty({
    type: "integer",
    nullable: true,
    description: "Pass as `after` to read the next page; null on the last page",
  })
  readonly nextCursor: number | null;

  constructor(fields: ReviewPageDto) {
    this.items = fields.items;
    this.nextCursor = fields.nextCursor;
  }
}
