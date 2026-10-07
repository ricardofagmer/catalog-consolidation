import type { IncomingMessage, ServerResponse } from "node:http";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { acceptCorrelationId, CORRELATION_ID_HEADER } from "./request-context.js";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware<IncomingMessage, ServerResponse> {
  use(request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void): void {
    const correlationId = acceptCorrelationId(request.headers[CORRELATION_ID_HEADER]);
    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
