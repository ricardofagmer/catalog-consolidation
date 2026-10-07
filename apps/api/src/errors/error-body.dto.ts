import { ApiProperty } from "@nestjs/swagger";
import { API_ERROR_CODES, type ApiErrorCode } from "./api-error-codes.js";

export interface ErrorBodyFields {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly correlationId: string;
}

/** The only error shape the API emits; it never carries stack traces, SQL or seller text. */
export class ErrorBodyDto {
  @ApiProperty({ description: "HTTP status of the response", example: 400 })
  readonly statusCode: number;

  @ApiProperty({ enum: API_ERROR_CODES, enumName: "ApiErrorCode", description: "Stable machine-readable code" })
  readonly code: ApiErrorCode;

  @ApiProperty({ description: "Human-readable summary; never echoes request values" })
  readonly message: string;

  @ApiProperty({ description: "Request correlation id, also sent in the x-correlation-id header" })
  readonly correlationId: string;

  constructor(fields: ErrorBodyFields) {
    this.statusCode = fields.statusCode;
    this.code = fields.code;
    this.message = fields.message;
    this.correlationId = fields.correlationId;
  }
}
