import { Module } from "@nestjs/common";
import { BaselineHeadersMiddleware } from "./baseline-headers.middleware.js";
import { ContentTypeMiddleware } from "./content-type.middleware.js";
import { CorrelationIdMiddleware } from "./correlation-id.middleware.js";
import { HostAllowlistMiddleware } from "./host-allowlist.middleware.js";
import { JsonBodyDepthMiddleware } from "./json-body-depth.middleware.js";

const HARDENING_MIDDLEWARES = [
  CorrelationIdMiddleware,
  HostAllowlistMiddleware,
  ContentTypeMiddleware,
  BaselineHeadersMiddleware,
  JsonBodyDepthMiddleware,
];

@Module({ providers: HARDENING_MIDDLEWARES, exports: HARDENING_MIDDLEWARES })
// Nest modules are metadata-only classes; the decorator carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class HttpHardeningModule {}
