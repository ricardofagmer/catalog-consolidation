import { Module } from "@nestjs/common";
import { RulesModule } from "@catalog/rules";
import { ConsolidationService } from "./consolidation.service.js";

// Nest reads a module entirely from its decorator metadata, so the class body is empty by design.
@Module({ imports: [RulesModule], providers: [ConsolidationService], exports: [ConsolidationService] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ConsolidationModule {}
