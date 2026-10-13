import { Module } from "@nestjs/common";
import { PersistenceModule } from "@catalog/persistence";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { SellerLinksController } from "./seller-links.controller.js";
import { SellerLinksService } from "./seller-links.service.js";

@Module({
  imports: [PersistenceModule],
  controllers: [CatalogController, SellerLinksController],
  providers: [CatalogService, SellerLinksService],
})
// Nest modules are metadata-only classes; the decorator carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CatalogModule {}
