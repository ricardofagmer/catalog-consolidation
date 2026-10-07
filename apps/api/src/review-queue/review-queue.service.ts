import { Injectable } from "@nestjs/common";
import type { ReviewStatus } from "@catalog/domain";
import { CatalogReadModel, ReviewUnitOfWorkFactory, type ReviewView } from "@catalog/persistence";
import { ReviewsService } from "@catalog/reviews";
import { DatabaseAccess } from "../database/index.js";

export interface ReviewQueueQuery {
  readonly status: ReviewStatus;
  readonly afterId: number;
  readonly limit: number;
}

export interface ReviewQueuePage {
  readonly views: readonly ReviewView[];
  readonly nextAfterId: number | null;
}

@Injectable()
export class ReviewQueueService {
  constructor(
    private readonly database: DatabaseAccess,
    private readonly unitOfWorkFactory: ReviewUnitOfWorkFactory,
    private readonly reviews: ReviewsService,
    private readonly readModel: CatalogReadModel,
  ) {}

  list(query: ReviewQueueQuery): ReviewQueuePage {
    // One read-only connection: the page and its candidates describe the same database state.
    return this.database.read((connection) => {
      const unitOfWork = this.unitOfWorkFactory.create({ connection });
      const page = this.reviews.list({ unitOfWork, ...query });
      return {
        views: this.readModel.reviewViews({ connection, records: page.records }),
        nextAfterId: page.nextAfterId,
      };
    });
  }
}
