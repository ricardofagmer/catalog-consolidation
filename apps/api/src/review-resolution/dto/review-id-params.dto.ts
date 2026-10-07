import { ApiProperty } from "@nestjs/swagger";
import { Transform, type TransformFnParams } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

// Digits only: Number() alone would accept "1e3", "0x10" or " 7 " as ids.
const POSITIVE_INTEGER_TEXT = /^[1-9][0-9]{0,15}$/u;

export class ReviewIdParamsDto {
  @ApiProperty({
    type: "integer",
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
    description: "Review queue row id (digits only)",
    example: 1,
  })
  @Transform(({ value }: TransformFnParams) => parsePathInteger(value))
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  readonly id!: number;
}

// Text that is not a plain positive integer is returned unchanged so @IsInt rejects it.
function parsePathInteger(value: unknown): unknown {
  return typeof value === "string" && POSITIVE_INTEGER_TEXT.test(value) ? Number(value) : value;
}
