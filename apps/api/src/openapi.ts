// Decorator metadata must be registered before any Nest-decorated class is loaded.
import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { buildOpenApiDocument } from "./openapi/index.js";

// The document only needs route and DTO metadata: no database is opened and nothing listens.
const PLACEHOLDER_CONFIG = { dbPath: "unused", port: 0, allowedHosts: [] } as const;
const OUTPUT_FILE = "openapi.json";
const JSON_INDENT = 2;
const EXIT_FAILURE = 1;

async function writeOpenApiDocument(): Promise<void> {
  const app = await NestFactory.create(AppModule.register(PLACEHOLDER_CONFIG), {
    logger: false,
    abortOnError: false,
  });
  try {
    const document = buildOpenApiDocument(app);
    // Compiled to dist/openapi.js, so the document lands in dist/openapi.json.
    const target = join(__dirname, OUTPUT_FILE);
    writeFileSync(target, `${JSON.stringify(document, null, JSON_INDENT)}\n`);
    process.stdout.write(`wrote ${target}\n`);
  } finally {
    await app.close();
  }
}

writeOpenApiDocument().catch((error: unknown) => {
  process.stderr.write(`error: could not write the OpenAPI document (${error instanceof Error ? error.name : typeof error})\n`);
  process.exitCode = EXIT_FAILURE;
});
