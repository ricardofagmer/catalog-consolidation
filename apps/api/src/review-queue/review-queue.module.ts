import { Module } from "@nestjs/common";
import { PersistenceModule } from "@catalog/persistence";
import { ReviewsModule } from "@catalog/reviews";
import { ReviewQueueController } from "./review-queue.controller.js";
import { ReviewQueueService } from "./review-queue.service.js";

@Module({
  imports: [PersistenceModule, ReviewsModule],
  controllers: [ReviewQueueController],
  providers: [ReviewQueueService],
})
// Nest modules are metadata-only classes; the decorator carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ReviewQueueModule {}
