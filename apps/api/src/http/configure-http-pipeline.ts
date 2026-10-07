import type { IncomingMessage, ServerResponse } from "node:http";
import type { NestMiddleware } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { BaselineHeadersMiddleware } from "./baseline-headers.middleware.js";
import { ContentTypeMiddleware } from "./content-type.middleware.js";
import { CorrelationIdMiddleware } from "./correlation-id.middleware.js";
import { HostAllowlistMiddleware } from "./host-allowlist.middleware.js";
import { JsonBodyDepthMiddleware } from "./json-body-depth.middleware.js";

const JSON_BODY_LIMIT = "16kb";

type HardeningMiddleware = NestMiddleware<IncomingMessage, ServerResponse>;

/**
 * Must run right after NestFactory.create and before SwaggerModule.setup. Express runs handlers in
 * registration order, while MiddlewareConsumer middleware is only registered at init, after the
 * Swagger routes; mounting here puts /docs and /docs-json behind the same Host check and headers.
 * The JSON parser follows the rejecting checks so rejected requests are never parsed; no urlencoded
 * parser exists. The depth bound needs the parsed body, so it is the one check mounted after it.
 */
export function configureHttpPipeline(app: NestExpressApplication): void {
  app.disable("x-powered-by");
  const ordered: readonly HardeningMiddleware[] = [
    app.get(CorrelationIdMiddleware),
    app.get(HostAllowlistMiddleware),
    app.get(ContentTypeMiddleware),
    app.get(BaselineHeadersMiddleware),
  ];
  for (const middleware of ordered) {
    mount(app, middleware);
  }
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  mount(app, app.get(JsonBodyDepthMiddleware));
}

function mount(app: NestExpressApplication, middleware: HardeningMiddleware): void {
  app.use((request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    middleware.use(request, response, next);
  });
}
