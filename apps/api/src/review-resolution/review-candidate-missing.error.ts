/** link-candidate was asked for a review whose queue row carries no candidate product. */
export class ReviewCandidateMissingError extends Error {
  readonly reviewId: number;

  constructor(args: { readonly reviewId: number }) {
    super(`review ${String(args.reviewId)} has no candidate product`);
    this.name = "ReviewCandidateMissingError";
    this.reviewId = args.reviewId;
  }
}
