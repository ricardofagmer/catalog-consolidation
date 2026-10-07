import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsInt, Max, Min } from "class-validator";
import { REVIEW_PAGE_DEFAULT_LIMIT, REVIEW_PAGE_MAX_LIMIT, REVIEW_STATUSES, type ReviewStatus } from "@catalog/domain";
import { toStrictInteger } from "../query-value.transforms.js";

const DEFAULT_REVIEW_STATUS: ReviewStatus = "PENDING";
const FIRST_PAGE_CURSOR = 0;

export class ListReviewsQueryDto {
  @ApiPropertyOptional({
    enum: REVIEW_STATUSES,
    enumName: "ReviewStatus",
    default: DEFAULT_REVIEW_STATUS,
    description: "Queue items in this status",
  })
  @IsIn(REVIEW_STATUSES)
  readonly status: ReviewStatus = DEFAULT_REVIEW_STATUS;

  @ApiPropertyOptional({
    type: "integer",
    minimum: 0,
    default: FIRST_PAGE_CURSOR,
    description: "Keyset cursor: return reviews with an id greater than this (the previous page's nextCursor)",
  })
  @Transform(({ value }) => toStrictInteger(value))
  @IsInt()
  @Min(0)
  readonly after: number = FIRST_PAGE_CURSOR;

  @ApiPropertyOptional({
    type: "integer",
    minimum: 1,
    maximum: REVIEW_PAGE_MAX_LIMIT,
    default: REVIEW_PAGE_DEFAULT_LIMIT,
    description: "Page size",
  })
  @Transform(({ value }) => toStrictInteger(value))
  @IsInt()
  @Min(1)
  @Max(REVIEW_PAGE_MAX_LIMIT)
  readonly limit: number = REVIEW_PAGE_DEFAULT_LIMIT;
}
