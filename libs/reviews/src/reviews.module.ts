import { Module } from "@nestjs/common";
import { RulesModule } from "@catalog/rules";
import { ReviewsService } from "./reviews.service.js";

// Nest reads a module entirely from its decorator metadata, so the class body is empty by design.
@Module({ imports: [RulesModule], providers: [ReviewsService], exports: [ReviewsService] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ReviewsModule {}
