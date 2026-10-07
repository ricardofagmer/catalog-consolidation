import { Global, Module, type DynamicModule } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { API_LOGGER, createRootLogger, requestLoggingOptions } from "./request-logging.js";

@Global()
@Module({})
// Nest modules are metadata-only classes; the static factory carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class RequestLoggingModule {
  static register(): DynamicModule {
    // One pino instance serves request logs, Nest's own logs and the exception filter's events.
    const logger = createRootLogger();
    return {
      module: RequestLoggingModule,
      imports: [LoggerModule.forRoot({ pinoHttp: requestLoggingOptions(logger) })],
      providers: [{ provide: API_LOGGER, useValue: logger }],
      exports: [API_LOGGER],
    };
  }
}
