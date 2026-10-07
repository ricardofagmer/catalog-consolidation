import { applyDecorators } from "@nestjs/common";
import { ApiExtraModels, ApiResponse } from "@nestjs/swagger";
import { ErrorBodyDto } from "./error-body.dto.js";

const STATUS_DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: "Invalid request (code invalid_request)",
  404: "Resource not found",
  409: "Conflict with the current state",
  415: "Request body is not application/json (code unsupported_media_type)",
  421: "Host header not allowed (code host_not_allowed)",
  422: "Request cannot be applied",
  500: "Unexpected failure (code internal)",
  503: "Database unavailable (code database)",
};
const FALLBACK_DESCRIPTION = "Error";

/** Documents each listed status with the shared error body; apply on every endpoint. */
export function ApiProblemResponses(...statuses: readonly number[]): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiExtraModels(ErrorBodyDto),
    ...statuses.map((status) =>
      ApiResponse({ status, description: STATUS_DESCRIPTIONS[status] ?? FALLBACK_DESCRIPTION, type: ErrorBodyDto }),
    ),
  );
}
