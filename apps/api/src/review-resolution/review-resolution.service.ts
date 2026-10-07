import type { DatabaseSync } from "node:sqlite";
import { Injectable } from "@nestjs/common";
import { ReviewResolutionError, type ResolutionResult, type ResolveCommand } from "@catalog/domain";
import { ReviewUnitOfWorkFactory, SqliteReviewRepository } from "@catalog/persistence";
import { ReviewsService } from "@catalog/reviews";
import { DatabaseAccess } from "../database/index.js";
import { ReviewCandidateMissingError } from "./review-candidate-missing.error.js";
import type { ResolutionRequest } from "./resolution-request.js";

/** Resolves one review exactly as the CLI and web did: one connection, write lock taken at BEGIN. */
@Injectable()
export class ReviewResolutionService {
  constructor(
    private readonly database: DatabaseAccess,
    private readonly reviewUnitOfWorkFactory: ReviewUnitOfWorkFactory,
    private readonly reviews: ReviewsService,
  ) {}

  // SQLite errors (SQLITE_BUSY after the busy timeout included) propagate unwrapped.
  resolve(request: ResolutionRequest): ResolutionResult {
    return this.database.write((connection) => {
      const command = request.kind === "link-candidate" ? candidateCommand(connection, request.reviewId) : request;
      // "immediate" takes the write lock up front, so a concurrent writer is waited on, not raced.
      const unitOfWork = this.reviewUnitOfWorkFactory.create({ connection, mode: "immediate" });
      return this.reviews.resolve({ unitOfWork, command });
    });
  }
}

// The candidate id comes from the queue row, never from the client, so a request cannot redirect
// the link. ReviewsService re-reads the row inside its transaction before writing.
function candidateCommand(connection: DatabaseSync, reviewId: number): ResolveCommand {
  const record = new SqliteReviewRepository({ connection }).get({ reviewId });
  if (record === null) {
    throw new ReviewResolutionError({ code: "review_not_found", detail: `review ${String(reviewId)} does not exist` });
  }
  // A resolved review answers not-pending whatever its candidate; statuses never return to PENDING.
  if (record.item.status !== "PENDING") {
    throw new ReviewResolutionError({ code: "review_not_pending", detail: `review ${String(reviewId)} is not PENDING` });
  }
  const productId = record.item.candidateProductId;
  if (productId === null) {
    throw new ReviewCandidateMissingError({ reviewId });
  }
  return { kind: "link", reviewId, productId };
}
