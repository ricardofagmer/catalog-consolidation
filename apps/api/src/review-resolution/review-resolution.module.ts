import { Module } from "@nestjs/common";
import { PersistenceModule } from "@catalog/persistence";
import { ReviewsModule } from "@catalog/reviews";
import { RulesModule } from "@catalog/rules";
import { ReviewResolutionController } from "./review-resolution.controller.js";
import { ReviewResolutionService } from "./review-resolution.service.js";

@Module({
  imports: [PersistenceModule, RulesModule, ReviewsModule],
  controllers: [ReviewResolutionController],
  providers: [ReviewResolutionService],
})
// Nest modules are metadata-only classes; the decorator carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ReviewResolutionModule {}
