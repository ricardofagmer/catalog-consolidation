import type { IncomingMessage, ServerResponse } from "node:http";
import { Catch, Inject, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { Logger } from "pino";
import { applyBaselineHeaders } from "../http/baseline-headers.middleware.js";
import { acceptCorrelationId, CORRELATION_ID_HEADER, pathWithoutQuery } from "../http/request-context.js";
import { API_LOGGER } from "../http/request-logging.js";
import { ErrorBodyDto } from "./error-body.dto.js";
import { classifyException, type ClassifiedProblem } from "./exception-classification.js";

const DATABASE_FAILED_EVENT = "api.database.failed";
const INTERNAL_FAILED_EVENT = "api.internal.failed";
const REQUEST_REJECTED_EVENT = "api.request.rejected";
// pino-http assigns request.log on every request it handles.
const REQUEST_LOGGER_MARKER = "log";

/** The single writer of error responses: always exactly statusCode, code, message, correlationId. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @Inject(API_LOGGER) private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<IncomingMessage>();
    const response = http.getResponse<ServerResponse>();
    const correlationId = request.correlationId ?? acceptCorrelationId(undefined);
    const problem = classifyException(exception);
    this.logOnce({ problem, request, correlationId });
    if (response.headersSent) {
      response.end();
      return;
    }
    applyBaselineHeaders(response);
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    const body = new ErrorBodyDto({
      statusCode: problem.status,
      code: problem.code,
      message: problem.message,
      correlationId,
    });
    this.adapterHost.httpAdapter.reply(response, body, problem.status);
  }

  // Only the event, the error type and ids are logged: messages may embed SQL or seller text.
  private logOnce(args: {
    readonly problem: ClassifiedProblem;
    readonly request: IncomingMessage;
    readonly correlationId: string;
  }): void {
    const { problem, request, correlationId } = args;
    switch (problem.log.kind) {
      case "client":
        // Host, media-type and body-parser rejections end before pino-http is mounted, so they get
        // their own line; client errors pino-http saw are already in its completion line.
        if (Object.hasOwn(request, REQUEST_LOGGER_MARKER)) {
          return;
        }
        this.logger.warn(
          {
            event: REQUEST_REJECTED_EVENT,
            code: problem.code,
            method: request.method,
            path: pathWithoutQuery(request.url),
            status: problem.status,
            correlationId,
          },
          "request rejected",
        );
        return;
      case "database":
        this.logger.error(
          { event: DATABASE_FAILED_EVENT, errorType: problem.log.errorType, correlationId },
          "database failure",
        );
        return;
      case "internal":
        this.logger.error(
          { event: INTERNAL_FAILED_EVENT, errorType: problem.log.errorType, correlationId },
          "unexpected failure",
        );
        return;
    }
  }
}
