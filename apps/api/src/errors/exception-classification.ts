import { HttpException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseFileError } from "@catalog/domain";
import { isSqliteError } from "@catalog/persistence";
import type { ApiErrorCode } from "./api-error-codes.js";
import { ApiProblem } from "./api-problem.js";

export type ProblemLog =
  | { readonly kind: "client" }
  | { readonly kind: "database"; readonly errorType: string }
  | { readonly kind: "internal"; readonly errorType: string };

export interface ClassifiedProblem {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly log: ProblemLog;
}

const BAD_REQUEST_STATUS = 400;
const NOT_FOUND_STATUS = 404;
const CLIENT_ERROR_MIN = 400;
const SERVER_ERROR_MIN = 500;
const INTERNAL_STATUS = 500;
const UNAVAILABLE_STATUS = 503;
const SAFE_TYPE_PATTERN = /^[A-Za-z0-9_.]{1,64}$/u;
const FALLBACK_ERROR_TYPE = "Error";
const READINESS_INDICATOR_KEY = "database";
const CLIENT_STATUS_MESSAGES: Readonly<Record<number, string>> = {
  400: "invalid request",
  404: "route not found",
  405: "method not allowed",
  413: "request body exceeds 16kb",
};
const BODY_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  "entity.too.large": "request body exceeds 16kb",
  "entity.parse.failed": "request body is not valid JSON",
};
const GENERIC_CLIENT_MESSAGE = "invalid request";
const BODY_UNREADABLE_MESSAGE = "request body could not be read";
const UNSUPPORTED_CHARSET_TYPE = "charset.unsupported";
// Must stay identical to the text ContentTypeMiddleware uses, so every 415 reads the same.
const UNSUPPORTED_MEDIA_TYPE_MESSAGE = "request body must be application/json";
const DATABASE_MESSAGE = "database unavailable";
const INTERNAL_MESSAGE = "internal error";

/** Maps any thrown value to the closed error vocabulary; exception text never reaches the result. */
export function classifyException(exception: unknown): ClassifiedProblem {
  if (exception instanceof ApiProblem) {
    return classifyApiProblem(exception);
  }
  if (isDatabaseFailure(exception)) {
    return databaseProblem(databaseErrorType(exception));
  }
  // Terminus reports a failed readiness check this way; its body names the indicator's errorType.
  if (exception instanceof ServiceUnavailableException) {
    return databaseProblem(readinessErrorType(exception.getResponse()) ?? exception.name);
  }
  if (exception instanceof NotFoundException) {
    return clientProblem(NOT_FOUND_STATUS, CLIENT_STATUS_MESSAGES[NOT_FOUND_STATUS] ?? GENERIC_CLIENT_MESSAGE);
  }
  if (exception instanceof HttpException && isClientStatus(exception.getStatus())) {
    const status = exception.getStatus();
    return clientProblem(status, CLIENT_STATUS_MESSAGES[status] ?? GENERIC_CLIENT_MESSAGE);
  }
  return classifyBodyFailure(exception) ?? classifyUntypedClientFailure(exception) ?? internalProblem(errorTypeOf(exception));
}

export function isDatabaseFailure(error: unknown): boolean {
  return error instanceof DatabaseFileError || isSqliteError(error);
}

/** A loggable type label: class name plus a closed code, never the error message. */
export function databaseErrorType(error: unknown): string {
  if (error instanceof DatabaseFileError) {
    return `DatabaseFileError.${error.code}`;
  }
  if (error instanceof Error && "errcode" in error && typeof error.errcode === "number") {
    return `SqliteError.${String(error.errcode)}`;
  }
  return errorTypeOf(error);
}

function classifyApiProblem(problem: ApiProblem): ClassifiedProblem {
  const status = problem.getStatus();
  const base = { status, code: problem.code, message: problem.message };
  if (problem.code === "database") {
    return { ...base, log: { kind: "database", errorType: problem.name } };
  }
  if (status >= SERVER_ERROR_MIN) {
    return { ...base, log: { kind: "internal", errorType: problem.name } };
  }
  return { ...base, log: { kind: "client" } };
}

// Express body-parser failures carry a client status and a `type` such as entity.too.large.
function classifyBodyFailure(exception: unknown): ClassifiedProblem | null {
  if (!(exception instanceof Error) || !("status" in exception) || !("type" in exception)) {
    return null;
  }
  const { status, type } = exception;
  if (typeof status !== "number" || typeof type !== "string" || !isClientStatus(status)) {
    return null;
  }
  if (type === UNSUPPORTED_CHARSET_TYPE) {
    // The charset value is attacker-controlled, so only the fixed message is returned.
    return { status, code: "unsupported_media_type", message: UNSUPPORTED_MEDIA_TYPE_MESSAGE, log: { kind: "client" } };
  }
  return clientProblem(status, BODY_FAILURE_MESSAGES[type] ?? BODY_UNREADABLE_MESSAGE);
}

// Express's router throws a URIError for a malformed percent-encoded path, tagged with status 400
// but no `type`; the raw path segment is never echoed back.
function classifyUntypedClientFailure(exception: unknown): ClassifiedProblem | null {
  if (!(exception instanceof Error) || "type" in exception) {
    return null;
  }
  if (isStatusTaggedError(exception) && isClientStatus(exception.status)) {
    const { status } = exception;
    return clientProblem(status, CLIENT_STATUS_MESSAGES[status] ?? GENERIC_CLIENT_MESSAGE);
  }
  if (exception instanceof URIError) {
    return clientProblem(BAD_REQUEST_STATUS, CLIENT_STATUS_MESSAGES[BAD_REQUEST_STATUS] ?? GENERIC_CLIENT_MESSAGE);
  }
  return null;
}

function isStatusTaggedError(error: Error): error is Error & { readonly status: number } {
  return "status" in error && typeof error.status === "number";
}

function readinessErrorType(response: unknown): string | null {
  if (typeof response !== "object" || response === null || !("error" in response)) {
    return null;
  }
  const failures = response.error;
  if (typeof failures !== "object" || failures === null || !(READINESS_INDICATOR_KEY in failures)) {
    return null;
  }
  const indicator: unknown = Reflect.get(failures, READINESS_INDICATOR_KEY);
  if (typeof indicator !== "object" || indicator === null || !("errorType" in indicator)) {
    return null;
  }
  return typeof indicator.errorType === "string" ? indicator.errorType : null;
}

function isClientStatus(status: number): boolean {
  return status >= CLIENT_ERROR_MIN && status < SERVER_ERROR_MIN;
}

function errorTypeOf(error: unknown): string {
  if (error instanceof Error) {
    return SAFE_TYPE_PATTERN.test(error.name) ? error.name : FALLBACK_ERROR_TYPE;
  }
  return typeof error;
}

function clientProblem(status: number, message: string): ClassifiedProblem {
  return { status, code: "invalid_request", message, log: { kind: "client" } };
}

function databaseProblem(errorType: string): ClassifiedProblem {
  return { status: UNAVAILABLE_STATUS, code: "database", message: DATABASE_MESSAGE, log: { kind: "database", errorType } };
}

function internalProblem(errorType: string): ClassifiedProblem {
  return { status: INTERNAL_STATUS, code: "internal", message: INTERNAL_MESSAGE, log: { kind: "internal", errorType } };
}
