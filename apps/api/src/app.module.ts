import { Module, ValidationPipe, type DynamicModule } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { ApiConfigModule, type ApiConfig } from "./config/index.js";
import { DatabaseModule } from "./database/index.js";
import { ApiExceptionFilter, validationProblem } from "./errors/index.js";
import { FEATURE_MODULES } from "./features.js";
import { HealthModule } from "./health/health.module.js";
import { HttpHardeningModule, RequestLoggingModule } from "./http/index.js";

function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // Rejected values and targets stay out of ValidationError objects entirely.
    validationError: { target: false, value: false },
    exceptionFactory: validationProblem,
  });
}

@Module({})
// Nest modules are metadata-only classes; the static factory carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ApiConfigModule.register(config),
        RequestLoggingModule.register(),
        HttpHardeningModule,
        DatabaseModule,
        HealthModule,
        ...FEATURE_MODULES,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_PIPE, useFactory: createValidationPipe },
      ],
    };
  }
}
