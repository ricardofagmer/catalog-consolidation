import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from "class-validator";
import { REVIEW_PAGE_DEFAULT_LIMIT, REVIEW_PAGE_MAX_LIMIT } from "@catalog/domain";
import {
  DEFAULT_PRODUCT_SORT_FIELD,
  DEFAULT_SORT_ORDER,
  PRODUCT_PAGE_MAX_OFFSET,
  PRODUCT_SORT_FIELDS,
  SORT_ORDERS,
  isKeysetOrder,
  type ProductSortField,
  type SortOrder,
} from "@catalog/persistence";
import { toOptionalSearchText, toStrictInteger } from "../query-value.transforms.js";

// Same bound the web search box enforced; MaxLength counts code points, not UTF-16 units.
const SEARCH_QUERY_MAX_LENGTH = 200;
const FIRST_PAGE_CURSOR = 0;
const FIRST_PAGE_OFFSET = 0;

/**
 * `after` is an id keyset cursor: it only means something for sort=id&order=asc, and combined with
 * an offset the page start would be ambiguous. Either misuse is reported against `after`.
 */
@ValidatorConstraint({ name: "keysetCursor" })
class KeysetCursorConstraint implements ValidatorConstraintInterface {
  validate(after: unknown, args: ValidationArguments): boolean {
    // A non-integer is the @IsInt/@Min failure; only a real cursor needs the keyset order.
    if (typeof after !== "number" || after <= FIRST_PAGE_CURSOR) {
      return true;
    }
    const query = args.object;
    return (
      query instanceof ListProductsQueryDto &&
      isKeysetOrder({ sort: query.sort, order: query.order }) &&
      query.offset === FIRST_PAGE_OFFSET
    );
  }

  defaultMessage(): string {
    return "after is only valid with sort=id, order=asc and no offset";
  }
}

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
    description:
      "Keyset cursor: return products with an id greater than this (the previous page's nextCursor). " +
      "A value above 0 is only valid with sort=id, order=asc and offset=0",
  })
  @Transform(({ value }) => toStrictInteger(value))
  @IsInt()
  @Min(0)
  @Validate(KeysetCursorConstraint)
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

  @ApiPropertyOptional({
    enum: PRODUCT_SORT_FIELDS,
    enumName: "ProductSortField",
    default: DEFAULT_PRODUCT_SORT_FIELD,
    description:
      "Sort column. name, brand and category compare case-insensitively; sellers is the first linked " +
      "seller name; sellerCount is the number of linked sellers. Missing values sort last; ties by id",
  })
  @IsIn(PRODUCT_SORT_FIELDS)
  readonly sort: ProductSortField = DEFAULT_PRODUCT_SORT_FIELD;

  @ApiPropertyOptional({
    enum: SORT_ORDERS,
    enumName: "SortOrder",
    default: DEFAULT_SORT_ORDER,
    description: "Sort direction",
  })
  @IsIn(SORT_ORDERS)
  readonly order: SortOrder = DEFAULT_SORT_ORDER;

  @ApiPropertyOptional({
    type: "integer",
    minimum: 0,
    maximum: PRODUCT_PAGE_MAX_OFFSET,
    default: FIRST_PAGE_OFFSET,
    description: "Rows to skip before the page (the previous page's nextOffset)",
  })
  @Transform(({ value }) => toStrictInteger(value))
  @IsInt()
  @Min(0)
  @Max(PRODUCT_PAGE_MAX_OFFSET)
  readonly offset: number = FIRST_PAGE_OFFSET;
}
