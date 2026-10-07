import { Module } from "@nestjs/common";
import { ConsolidationModule } from "@catalog/consolidation";
import { PersistenceModule } from "@catalog/persistence";
import { ReviewsModule } from "@catalog/reviews";
import { RulesModule } from "@catalog/rules";
import { ConsolidateCommand } from "./commands/consolidate.command.js";
import { MigrateCommand } from "./commands/migrate.command.js";
import { ReviewCommand } from "./commands/review.command.js";

@Module({
  imports: [RulesModule, PersistenceModule, ConsolidationModule, ReviewsModule],
  providers: [MigrateCommand, ConsolidateCommand, ReviewCommand],
})
// Nest modules are metadata-only classes; the decorator carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CliModule {}
