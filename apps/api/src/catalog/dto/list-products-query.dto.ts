import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { REVIEW_PAGE_DEFAULT_LIMIT, REVIEW_PAGE_MAX_LIMIT } from "@catalog/domain";
import { toOptionalSearchText, toStrictInteger } from "../query-value.transforms.js";

// Same bound the web search box enforced; MaxLength counts code points, not UTF-16 units.
const SEARCH_QUERY_MAX_LENGTH = 200;
const FIRST_PAGE_CURSOR = 0;

export class ListProductsQueryDto {
  @ApiPropertyOptional({
    description: "Accent- and case-insensitive product name search; blank means no filter",
    maxLength: SEARCH_QUERY_MAX_LENGTH,
    example: "camera",
  })
  @Transform(({ value }) => toOptionalSearchText(value))
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  readonly q?: string;

  @ApiPropertyOptional({
    type: "integer",
    minimum: 0,
    default: FIRST_PAGE_CURSOR,
    description: "Keyset cursor: return products with an id greater than this (the previous page's nextCursor)",
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
