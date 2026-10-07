import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { DatabaseReadinessIndicator } from "./database-readiness.indicator.js";
import { HealthController } from "./health.controller.js";

@Module({
  // Terminus' own failure log is off: the exception filter logs each database failure once.
  imports: [TerminusModule.forRoot({ logger: false })],
  controllers: [HealthController],
  providers: [DatabaseReadinessIndicator],
})
// Nest modules are metadata-only classes; the decorator carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class HealthModule {}
