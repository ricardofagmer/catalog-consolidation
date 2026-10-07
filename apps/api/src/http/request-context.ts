import { randomUUID } from "node:crypto";

declare module "http" {
  interface IncomingMessage {
    /** Set by CorrelationIdMiddleware, the first middleware of every request. */
    correlationId?: string;
  }
}

export const CORRELATION_ID_HEADER = "x-correlation-id";
// Inbound ids are echoed and logged, so only short opaque tokens are accepted.
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u;
const QUERY_SEPARATOR = "?";
const UNKNOWN_PATH = "/";

export function acceptCorrelationId(inbound: string | readonly string[] | undefined): string {
  return typeof inbound === "string" && CORRELATION_ID_PATTERN.test(inbound) ? inbound : randomUUID();
}

/** Request path without the query string: queries may carry search text and never reach logs. */
export function pathWithoutQuery(url: string | undefined): string {
  return url?.split(QUERY_SEPARATOR, 1)[0] ?? UNKNOWN_PATH;
}
