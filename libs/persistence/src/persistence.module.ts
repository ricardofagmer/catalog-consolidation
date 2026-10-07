import { Module } from "@nestjs/common";
import { RulesModule } from "@catalog/rules";
import { CatalogReadModel } from "./catalog-read-model.js";
import { JsonEntryReaderFactory } from "./json-entry-reader.js";
import { PythonFormat } from "./python-format.js";
import { ReportWriter } from "./report-writer.js";
import { SqliteConnectionFactory } from "./sqlite-connection.factory.js";
import { SqliteMigrationRunner } from "./sqlite-migrations.js";
import { ReviewUnitOfWorkFactory, UnitOfWorkFactory } from "./unit-of-work.factory.js";

const PERSISTENCE_PROVIDERS = [
  SqliteConnectionFactory,
  SqliteMigrationRunner,
  UnitOfWorkFactory,
  ReviewUnitOfWorkFactory,
  JsonEntryReaderFactory,
  ReportWriter,
  PythonFormat,
  CatalogReadModel,
];

@Module({
  imports: [RulesModule],
  providers: PERSISTENCE_PROVIDERS,
  exports: PERSISTENCE_PROVIDERS,
})
// Nest modules are metadata-only classes; the decorator carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PersistenceModule {}
