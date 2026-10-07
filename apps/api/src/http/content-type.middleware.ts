import type { IncomingMessage, ServerResponse } from "node:http";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { ApiProblem } from "../errors/api-problem.js";

const UNSUPPORTED_MEDIA_TYPE_STATUS = 415;
const JSON_MEDIA_TYPE = "application/json";
const PARAMETER_SEPARATOR = ";";
const BODYLESS_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * JSON only: rejecting other media types before any body parser runs keeps HTML-form posts (the
 * one cross-site write a browser sends without a preflight) from ever reaching a handler.
 */
@Injectable()
export class ContentTypeMiddleware implements NestMiddleware<IncomingMessage, ServerResponse> {
  use(request: IncomingMessage, _response: ServerResponse, next: (error?: unknown) => void): void {
    if (request.method !== undefined && BODYLESS_METHODS.has(request.method)) {
      next();
      return;
    }
    if (mediaType(request.headers["content-type"]) !== JSON_MEDIA_TYPE) {
      next(
        new ApiProblem({
          code: "unsupported_media_type",
          status: UNSUPPORTED_MEDIA_TYPE_STATUS,
          message: "request body must be application/json",
        }),
      );
      return;
    }
    next();
  }
}

function mediaType(contentType: string | undefined): string | null {
  const essence = contentType?.split(PARAMETER_SEPARATOR, 1)[0]?.trim().toLowerCase();
  return essence === undefined || essence === "" ? null : essence;
}
