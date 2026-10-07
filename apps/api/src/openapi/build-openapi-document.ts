import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { ErrorBodyDto } from "../errors/index.js";

const TITLE = "Catalog consolidation API";
const DESCRIPTION =
  "Loopback JSON API over the catalog database. Every error body is ErrorBodyDto with a code from ApiErrorCode.";
const VERSION = "1";

/** The single source of the HTTP contract: served at /docs-json and written by openapi.ts. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder().setTitle(TITLE).setDescription(DESCRIPTION).setVersion(VERSION).build();
  return SwaggerModule.createDocument(app, config, { extraModels: [ErrorBodyDto] });
}
