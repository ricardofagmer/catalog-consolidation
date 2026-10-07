// Decorator metadata must be registered before any Nest-decorated class is loaded.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { ApiConfigError, loadApiConfig, type ApiConfig } from "./config/index.js";
import { configureHttpPipeline } from "./http/index.js";
import { buildOpenApiDocument } from "./openapi/index.js";

const LOOPBACK_HOST = "127.0.0.1";
const DOCS_PATH = "docs";
const DOCS_JSON_PATH = "docs-json";
const EXIT_FAILURE = 1;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;

async function bootstrap(): Promise<void> {
  const config = readConfig();
  if (config === null) {
    process.exitCode = EXIT_FAILURE;
    return;
  }
  // abortOnError false: a failed bootstrap rejects here and prints one line instead of aborting.
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    bufferLogs: true,
    bodyParser: false,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureHttpPipeline(app);
  SwaggerModule.setup(DOCS_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: DOCS_JSON_PATH,
    raw: ["json"],
  });
  await app.listen(config.port, LOOPBACK_HOST);
}

function readConfig(): ApiConfig | null {
  try {
    return loadApiConfig();
  } catch (error: unknown) {
    if (error instanceof ApiConfigError) {
      process.stderr.write(`error: ${error.message}\n`);
      return null;
    }
    throw error;
  }
}

// Only a system error code (EADDRINUSE) or the error class is printed: messages may carry paths or SQL.
function startupFailureLabel(error: unknown): string {
  if (error instanceof Error && "code" in error && typeof error.code === "string" && ERROR_CODE_PATTERN.test(error.code)) {
    return error.code;
  }
  return error instanceof Error ? error.name : typeof error;
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`error: the API failed to start (${startupFailureLabel(error)})\n`);
  // Open handles (a half-started server) would otherwise keep the process alive.
  process.exit(EXIT_FAILURE);
});
