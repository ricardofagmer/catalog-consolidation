import { ApiProblem } from "../errors/index.js";
import type { ResolveReviewRequestDto } from "./dto/resolve-review-request.dto.js";
import type { ResolutionRequest } from "./resolution-request.js";

const BAD_REQUEST_STATUS = 400;
const MISSING_PRODUCT_ID_MESSAGE = "invalid request fields: productId";

export function toResolutionRequest(args: {
  readonly reviewId: number;
  readonly body: ResolveReviewRequestDto;
}): ResolutionRequest {
  const { reviewId, body } = args;
  switch (body.action) {
    case "link-candidate":
      return { kind: "link-candidate", reviewId };
    case "create":
      return { kind: "create", reviewId };
    case "reject":
      return { kind: "reject", reviewId };
    case "link-other":
      // The body validator already requires it; this keeps the type honest without an assertion.
      if (body.productId === undefined) {
        throw new ApiProblem({ code: "invalid_request", status: BAD_REQUEST_STATUS, message: MISSING_PRODUCT_ID_MESSAGE });
      }
      return { kind: "link", reviewId, productId: body.productId };
  }
}
