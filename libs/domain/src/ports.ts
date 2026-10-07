import type {
  CatalogProduct,
  FuzzyCandidate,
  InputEntry,
  NewProduct,
  NewReviewItem,
  NewSellerLink,
  ProductKeySource,
  ReviewItem,
  ReviewRecord,
  ReviewStatus,
  SellerLink,
} from "./models.js";

// Every method is synchronous: node:sqlite is synchronous, and a synchronous domain keeps writes
// visible to later entries inside one transaction in exactly the Python order.

export interface CatalogReader {
  findByNormalizedName(args: {
    normalizedName: string;
    normalizedBrand: string | null;
  }): readonly CatalogProduct[];
  // Keyset batches of FUZZY_SCAN_BATCH_SIZE.
  listBrandCompatible(args: { normalizedBrand: string | null }): Iterable<FuzzyCandidate>;
}

export interface CatalogRepository extends CatalogReader {
  findLinkBySku(args: { sellerName: string; sellerProductId: string }): SellerLink | null;
  findLinkBySellerProduct(args: { sellerName: string; productId: number }): SellerLink | null;
  findReviewBySku(args: { sellerName: string; sellerProductId: string }): ReviewItem | null;
  insertProduct(product: NewProduct): number;
  insertLink(link: NewSellerLink): number;
  enqueueReview(review: NewReviewItem): number;
  // Products written by other tools arrive with NULL match keys; the use case heals them at the
  // start of every run so they stay visible to matching (decision recorded 2026-10-05).
  listProductsMissingMatchKeys(args: { afterId: number; limit: number }): readonly ProductKeySource[];
  setMatchKeys(args: { productId: number; normalizedName: string; normalizedBrand: string | null }): void;
}

export interface UnitOfWork {
  readonly catalog: CatalogRepository;
  commit(): void;
  rollback(): void;
  // Rows inserted/updated since this unit of work was built.
  rowsWritten(): number;
}

export interface EntrySource {
  // Throws InvalidInputFileError.
  read(): readonly InputEntry[];
}

export interface ReviewRepository {
  // Keyset on Id, ascending.
  listByStatus(args: { status: ReviewStatus; afterId: number; limit: number }): readonly ReviewRecord[];
  get(args: { reviewId: number }): ReviewRecord | null;
  productExists(args: { productId: number }): boolean;
  // Conditional on the current status, so a concurrent resolution cannot be overwritten.
  transitionStatus(args: { reviewId: number; fromStatus: ReviewStatus; toStatus: ReviewStatus }): boolean;
}

export interface ReviewUnitOfWork {
  readonly catalog: CatalogRepository;
  readonly reviews: ReviewRepository;
  commit(): void;
  rollback(): void;
}
