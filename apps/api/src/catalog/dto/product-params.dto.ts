import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, Min } from "class-validator";
import { toStrictInteger } from "../query-value.transforms.js";

// The route always supplies the parameter, so this initializer is only ever overwritten; it is
// deliberately below the minimum so a missing value could never pass validation.
const UNSET_PRODUCT_ID = 0;

export class ProductParamsDto {
  @ApiProperty({ type: "integer", minimum: 1, description: "Product id", example: 976 })
  @Transform(({ value }) => toStrictInteger(value))
  @IsInt()
  @Min(1)
  readonly id: number = UNSET_PRODUCT_ID;
}
