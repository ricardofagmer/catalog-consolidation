import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type, type TransformFnParams } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsString, Matches, MaxLength, Min, ValidateNested } from "class-validator";
import { MAX_SELLER_NAME_LENGTH, MAX_SELLER_PRODUCT_ID_LENGTH, SELLER_PRODUCT_ID_PATTERN } from "@catalog/domain";
import { toStrictInteger } from "../query-value.transforms.js";

// Surrounding whitespace is never meaningful in either field; non-strings stay for the validators.
function trimText({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : value;
}

/** One seller link: the body of an edit (PUT) and each entry of an add (POST). */
export class SellerLinkRequestDto {
  @ApiProperty({
    maxLength: MAX_SELLER_NAME_LENGTH,
    description: "Seller name. A name the catalog does not know yet registers a new seller",
    example: "MegaStore",
  })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SELLER_NAME_LENGTH)
  readonly sellerName!: string;

  @ApiProperty({
    maxLength: MAX_SELLER_PRODUCT_ID_LENGTH,
    pattern: SELLER_PRODUCT_ID_PATTERN.source,
    description: "The seller's own product id (SKU): letters, digits, dot, underscore and hyphen",
    example: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SELLER_PRODUCT_ID_LENGTH)
  @Matches(SELLER_PRODUCT_ID_PATTERN)
  readonly sellerProductId!: string;
}

export const MAX_LINKS_PER_REQUEST = 50;

export class AddSellerLinksRequestDto {
  @ApiProperty({
    type: [SellerLinkRequestDto],
    minItems: 1,
    maxItems: MAX_LINKS_PER_REQUEST,
    description: "Sellers to link to the product. All are linked, or none: one refusal rejects the whole request",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINKS_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => SellerLinkRequestDto)
  readonly links!: readonly SellerLinkRequestDto[];
}

// The route always supplies the parameter; the initializer is below the minimum so a missing value
// could never pass validation.
const UNSET_ID = 0;

export class SellerLinkParamsDto {
  @ApiProperty({ type: "integer", minimum: 1, description: "Product id", example: 44 })
  @Transform(({ value }: TransformFnParams) => toStrictInteger(value))
  @IsInt()
  @Min(1)
  readonly id: number = UNSET_ID;

  @ApiProperty({ type: "integer", minimum: 1, description: "Seller link id (SellerOffer.id)", example: 1 })
  @Transform(({ value }: TransformFnParams) => toStrictInteger(value))
  @IsInt()
  @Min(1)
  readonly linkId: number = UNSET_ID;
}
