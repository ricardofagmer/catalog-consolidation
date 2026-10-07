import type { IncomingMessage, ServerResponse } from "node:http";
import { Injectable, type NestMiddleware } from "@nestjs/common";

// Clickjacking: a framed /docs page could be tricked into "Try it out" writes that pass every
// same-origin defense, so nothing may frame any response. The CSP carries only frame-ancestors
// because a fuller policy would block the inline scripts and styles of the Swagger UI page.
// No access-control-* header is ever set: the API serves only same-host server-side callers.
const BASELINE_HEADERS: readonly (readonly [string, string])[] = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "no-referrer"],
  ["Cache-Control", "no-store"],
  ["X-Frame-Options", "DENY"],
  ["Content-Security-Policy", "frame-ancestors 'none'"],
];

export function applyBaselineHeaders(response: ServerResponse): void {
  if (response.headersSent) {
    return;
  }
  for (const [name, value] of BASELINE_HEADERS) {
    response.setHeader(name, value);
  }
}

@Injectable()
export class BaselineHeadersMiddleware implements NestMiddleware<IncomingMessage, ServerResponse> {
  use(_request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void): void {
    applyBaselineHeaders(response);
    next();
  }
}
