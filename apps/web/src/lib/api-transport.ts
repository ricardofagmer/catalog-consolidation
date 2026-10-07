// The one place the web talks to the catalog API. Server-side only: the browser never contacts the
// API, and nothing here may be imported from a client component.
import "server-only";
import { createApiClient, type ApiClient, type ApiErrorCode } from "@catalog/api-client";
import { readErrorBody } from "./api-error-body";
import { getWebConfig } from "./config";

const API_REQUEST_TIMEOUT_MS = 10_000;
const READINESS_TIMEOUT_MS = 3_000;
const CORRELATION_ID_HEADER = "x-correlation-id";
// Shares the CLI's and API's `service` prefix so one log pipeline key covers every entry point.
const LOG_SERVICE_NAME = "catalog_consolidation_web";
const READY_STATUS = 200;

export type CorrelationHeaders = Readonly<Record<typeof CORRELATION_ID_HEADER, string>>;

/** Structural view of an openapi-fetch result, so one helper serves every operation. */
export interface FetchResult<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly response: Response;
}

export interface ApiFailure {
  readonly statusCode: number | null;
  readonly code: ApiErrorCode | null;
  readonly correlationId: string;
}

export type ApiOutcome<T> = { readonly kind: "ok"; readonly data: T } | { readonly kind: "failed"; readonly failure: ApiFailure };

/**
 * Thrown for every failure the page cannot act on. The message names only the operation: the API
 * body, URL and stack stay on the server, and error.tsx shows the digest alone.
 */
export class CatalogApiError extends Error {
  constructor(operation: string) {
    super(`catalog API request failed: ${operation}`);
    this.name = "CatalogApiError";
  }
}

// Absolute timeout covering connect, headers and body; no retries (a resolve must never be sent
// twice). no-store keeps Next from caching any API response.
const timedFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(API_REQUEST_TIMEOUT_MS);
  // openapi-fetch passes a Request whose signal carries any shorter per-call deadline.
  const signal = input instanceof Request ? AbortSignal.any([input.signal, timeout]) : timeout;
  return fetch(input, { ...init, cache: "no-store", signal });
};

let client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (client === null) {
    client = createApiClient({ baseUrl: getWebConfig().apiOrigin, fetch: timedFetch });
  }
  return client;
}

/**
 * Sends one request with a fresh correlation id. Transport failures (refused, timeout, unparsable
 * body) are logged and thrown; HTTP failures are returned for the caller to classify.
 */
export async function sendApiRequest<T>(args: {
  readonly operation: string;
  readonly send: (client: ApiClient, headers: CorrelationHeaders) => Promise<FetchResult<T>>;
}): Promise<ApiOutcome<T>> {
  const correlationId = crypto.randomUUID();
  let result: FetchResult<T>;
  try {
    result = await args.send(getApiClient(), { [CORRELATION_ID_HEADER]: correlationId });
  } catch (error: unknown) {
    logApiFailure({
      operation: args.operation,
      failure: { statusCode: null, code: null, correlationId },
      errorType: error instanceof Error ? error.name : typeof error,
    });
    throw new CatalogApiError(args.operation);
  }
  if (result.response.ok && result.data !== undefined) {
    return { kind: "ok", data: result.data };
  }
  const body = readErrorBody(result.error);
  return {
    kind: "failed",
    failure: {
      statusCode: result.response.status,
      code: body?.code ?? null,
      correlationId: body?.correlationId ?? correlationId,
    },
  };
}

/** Logs one line and throws: for HTTP failures the page has no designed state for. */
export function failApiRequest(args: { readonly operation: string; readonly failure: ApiFailure }): never {
  logApiFailure({ operation: args.operation, failure: args.failure, errorType: null });
  throw new CatalogApiError(args.operation);
}

/** True only when GET /health/ready answers 200 {status:"ok"} within the readiness timeout. */
export async function isApiReady(): Promise<boolean> {
  try {
    const { data, response } = await getApiClient().GET("/health/ready", {
      headers: { [CORRELATION_ID_HEADER]: crypto.randomUUID() },
      signal: AbortSignal.timeout(READINESS_TIMEOUT_MS),
    });
    return response.status === READY_STATUS && data?.status === "ok";
  } catch {
    // Refused or timed out: not ready. The caller reports it; the API may simply start later.
    return false;
  }
}

// Only the operation, status, code and correlation id are logged: the API's message and the
// request values are never copied, so seller text cannot reach the web's logs.
function logApiFailure(args: {
  readonly operation: string;
  readonly failure: ApiFailure;
  readonly errorType: string | null;
}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level: "error",
    service: LOG_SERVICE_NAME,
    event: "api.request.failed",
    operation: args.operation,
    statusCode: args.failure.statusCode,
    code: args.failure.code,
    errorType: args.errorType,
    correlationId: args.failure.correlationId,
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}
