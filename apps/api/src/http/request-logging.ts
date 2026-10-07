import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pino, type Logger } from "pino";
import type { Options } from "pino-http";
import { pathWithoutQuery } from "./request-context.js";

export const API_LOGGER = "API_LOGGER";

const SERVICE_NAME = "catalog_consolidation_api";
const REQUEST_EVENT = "api.request";
const SERVER_ERROR_STATUS = 500;
const CLIENT_ERROR_STATUS = 400;

export function createRootLogger(): Logger {
  return pino({
    base: { service: SERVICE_NAME },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: { level: (label) => ({ level: label }) },
  });
}

/** pino-http options: one completion line per request with method, query-free path and status only. */
export function requestLoggingOptions(logger: Logger): Options {
  return {
    logger,
    genReqId: (request) => request.correlationId ?? randomUUID(),
    quietReqLogger: true,
    customAttributeKeys: { reqId: "correlationId", responseTime: "durationMs" },
    serializers: { req: serializeRequest, res: serializeResponse },
    customLogLevel: (_request, response) => levelForStatus(response.statusCode),
    customSuccessMessage: () => "request completed",
    customErrorMessage: () => "request failed",
    customSuccessObject: (_request: IncomingMessage, response: ServerResponse, value: object) =>
      completionFields(response, value),
    customErrorObject: (_request: IncomingMessage, response: ServerResponse, _error: Error, value: object) =>
      completionFields(response, value),
  };
}

function levelForStatus(status: number): "info" | "warn" | "error" {
  if (status >= SERVER_ERROR_STATUS) {
    return "error";
  }
  return status >= CLIENT_ERROR_STATUS ? "warn" : "info";
}

// pino-http's synthetic `err` for 5xx responses is dropped: the exception filter already logged the cause.
function completionFields(response: ServerResponse, value: object): object {
  const durationMs = "durationMs" in value ? value.durationMs : undefined;
  return { event: REQUEST_EVENT, res: response, durationMs };
}

function serializeRequest(request: unknown): object {
  if (typeof request !== "object" || request === null) {
    return {};
  }
  const method = "method" in request && typeof request.method === "string" ? request.method : undefined;
  const url = "url" in request && typeof request.url === "string" ? request.url : undefined;
  return { method, path: pathWithoutQuery(url) };
}

function serializeResponse(response: unknown): object {
  if (typeof response !== "object" || response === null) {
    return {};
  }
  const status = "statusCode" in response && typeof response.statusCode === "number" ? response.statusCode : undefined;
  return { status };
}
