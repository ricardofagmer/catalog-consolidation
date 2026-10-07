// List the review queue and resolve one row, each inside a single transaction (ADR 0004).
import { Injectable } from "@nestjs/common";
import {
  REVIEW_PAGE_MAX_LIMIT,
  ReviewResolutionError,
  type MatchType,
  type NewProduct,
  type ResolutionResult,
  type ResolveCommand,
  type ReviewPage,
  type ReviewRecord,
  type ReviewStatus,
  type ReviewUnitOfWork,
} from "@catalog/domain";
import { NormalizationService } from "@catalog/rules";

@Injectable()
export class ReviewsService {
  constructor(private readonly normalization: NormalizationService) {}

  list(args: { unitOfWork: ReviewUnitOfWork; status: ReviewStatus; afterId: number; limit: number }): ReviewPage {
    const { unitOfWork, status, afterId, limit } = args;
    let records: readonly ReviewRecord[];
    try {
      // Validated inside the try, unlike Python: the unit of work has already issued BEGIN, so a
      // bad limit must still end that transaction or the connection's next BEGIN fails.
      if (!(Number.isInteger(limit) && limit >= 1 && limit <= REVIEW_PAGE_MAX_LIMIT)) {
        throw new RangeError(`limit must be between 1 and ${String(REVIEW_PAGE_MAX_LIMIT)}, got ${String(limit)}`);
      }
      // One look-ahead row tells whether a next page exists without a COUNT query.
      records = unitOfWork.reviews.listByStatus({ status, afterId, limit: limit + 1 });
    } finally {
      // Read-only: end the transaction instead of holding it open.
      unitOfWork.rollback();
    }
    const page = records.slice(0, limit);
    const hasMore = records.length > limit;
    const last = page.at(-1);
    return { records: page, nextAfterId: hasMore && last !== undefined ? last.item.id : null };
  }

  resolve(args: { unitOfWork: ReviewUnitOfWork; command: ResolveCommand }): ResolutionResult {
    const { unitOfWork, command } = args;
    let result: ResolutionResult;
    try {
      result = this.applyResolution(unitOfWork, command);
      unitOfWork.commit();
    } catch (error: unknown) {
      // SQLite errors propagate unchanged: callers map them to a database failure, not a review code.
      unitOfWork.rollback();
      throw error;
    }
    return result;
  }

  private applyResolution(unitOfWork: ReviewUnitOfWork, command: ResolveCommand): ResolutionResult {
    const record = this.pendingRecord(unitOfWork, command.reviewId);
    if (command.kind === "reject") {
      this.transition(unitOfWork, record, "REJECTED");
      return { reviewId: record.item.id, status: "REJECTED", productId: null, linkId: null };
    }
    this.requireSkuUnlinked(unitOfWork, record);
    if (command.kind === "create") {
      const productId = unitOfWork.catalog.insertProduct(this.newProduct(record));
      const linkId = this.link(unitOfWork, record, { productId, matchType: "CREATED" });
      this.transition(unitOfWork, record, "CREATED");
      return { reviewId: record.item.id, status: "CREATED", productId, linkId };
    }
    if (!unitOfWork.reviews.productExists({ productId: command.productId })) {
      throw new ReviewResolutionError({
        code: "product_not_found",
        detail: `product ${String(command.productId)} does not exist`,
      });
    }
    this.requireSellerNotOnProduct(unitOfWork, record, command.productId);
    const linkId = this.link(unitOfWork, record, { productId: command.productId, matchType: "REVIEWED" });
    this.transition(unitOfWork, record, "LINKED");
    return { reviewId: record.item.id, status: "LINKED", productId: command.productId, linkId };
  }

  private pendingRecord(unitOfWork: ReviewUnitOfWork, reviewId: number): ReviewRecord {
    const record = unitOfWork.reviews.get({ reviewId });
    if (record === null) {
      throw new ReviewResolutionError({
        code: "review_not_found",
        detail: `review ${String(reviewId)} does not exist`,
      });
    }
    if (record.item.status !== "PENDING") {
      throw new ReviewResolutionError({
        code: "review_not_pending",
        detail: `review ${String(reviewId)} is ${record.item.status}, only PENDING can be resolved`,
      });
    }
    return record;
  }

  private requireSkuUnlinked(unitOfWork: ReviewUnitOfWork, record: ReviewRecord): void {
    const existing = unitOfWork.catalog.findLinkBySku({
      sellerName: record.item.sellerName,
      sellerProductId: record.item.sellerProductId,
    });
    if (existing !== null) {
      throw new ReviewResolutionError({
        code: "seller_sku_already_linked",
        detail:
          `review ${String(record.item.id)}: seller SKU already linked to product ` +
          `${String(existing.productId)} (link ${String(existing.id)})`,
      });
    }
  }

  private requireSellerNotOnProduct(unitOfWork: ReviewUnitOfWork, record: ReviewRecord, productId: number): void {
    const existing = unitOfWork.catalog.findLinkBySellerProduct({
      sellerName: record.item.sellerName,
      productId,
    });
    if (existing !== null) {
      throw new ReviewResolutionError({
        code: "seller_already_linked_to_product",
        detail:
          `review ${String(record.item.id)}: seller already linked to product ${String(productId)} ` +
          `(link ${String(existing.id)})`,
      });
    }
  }

  private link(
    unitOfWork: ReviewUnitOfWork,
    record: ReviewRecord,
    target: { productId: number; matchType: MatchType },
  ): number {
    return unitOfWork.catalog.insertLink({
      sellerName: record.item.sellerName,
      sellerProductId: record.item.sellerProductId,
      productId: target.productId,
      sourceName: record.sourceName,
      sourceBrand: record.sourceBrand,
      sourceCategory: record.sourceCategory,
      matchType: target.matchType,
    });
  }

  private transition(unitOfWork: ReviewUnitOfWork, record: ReviewRecord, toStatus: ReviewStatus): void {
    const moved = unitOfWork.reviews.transitionStatus({
      reviewId: record.item.id,
      fromStatus: "PENDING",
      toStatus,
    });
    if (!moved) {
      // Another resolver changed the row between the read and this write.
      throw new ReviewResolutionError({
        code: "review_not_pending",
        detail: `review ${String(record.item.id)} is no longer PENDING`,
      });
    }
  }

  private newProduct(record: ReviewRecord): NewProduct {
    const name = this.normalization.cleanDisplay(record.sourceName);
    const normalizedName = this.normalization.normalize(record.sourceName);
    // Unreachable for rows the consolidator queued: it rejects unnormalizable names first.
    if (name === null || normalizedName === null) {
      throw new ReviewResolutionError({
        code: "source_name_unnormalizable",
        detail: `review ${String(record.item.id)}: source name has no normalized form`,
      });
    }
    return {
      name,
      brand: this.normalization.cleanDisplay(record.sourceBrand),
      category: this.normalization.cleanDisplay(record.sourceCategory),
      normalizedName,
      normalizedBrand: this.normalization.normalize(record.sourceBrand),
    };
  }
}
