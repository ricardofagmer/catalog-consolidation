"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResolutionAction, ResolutionRequest, ResolutionResponse } from "@catalog/api-client";
import { resolveReview } from "../../lib/catalog-api";
import { NOTICE_STATUSES, parsePositiveInteger, type NoticeStatus } from "../../lib/search-params";

const FORM_ACTIONS = ["link-candidate", "link-other", "create", "reject"] as const satisfies readonly ResolutionAction[];
type FormAction = (typeof FORM_ACTIONS)[number];

const INVALID_REQUEST_URL = "/reviews?error=invalid_request";

interface FormCommand {
  readonly reviewId: number;
  readonly request: ResolutionRequest;
}

/**
 * Resolves one review from a `/reviews` form through the API and redirects back with a notice or
 * an error code. The resolve rules live in the API; this only validates the form and maps its
 * expected refusals, so a stale or double-submitted form lands on `review_not_pending`. Anything
 * else (API down, timeout, busy database) throws to error.tsx.
 */
export async function resolveReviewAction(formData: FormData): Promise<never> {
  const command = parseCommand(formData);
  if (command === null) {
    redirect(INVALID_REQUEST_URL);
  }

  const outcome = await resolveReview(command);
  if (outcome.kind === "rejected") {
    redirect(`/reviews?status=PENDING&error=${outcome.code}&review=${String(command.reviewId)}`);
  }
  const { result } = outcome;
  revalidatePath("/");
  revalidatePath("/reviews");
  revalidatePath("/products/[id]", "page");
  const product = result.productId === null ? "" : `&product=${String(result.productId)}`;
  redirect(
    `/reviews?status=PENDING&notice=${noticeStatus(result)}&review=${String(command.reviewId)}${product}`,
  );
}

// Form fields are untrusted: each must appear exactly once as a string, ids must be positive
// integers and the action must be in the closed set. Anything else is one `invalid_request`.
// link-candidate carries no product id: the API reads the candidate from the queue row, so a
// tampered form cannot redirect the link.
function parseCommand(formData: FormData): FormCommand | null {
  const reviewId = parsePositiveInteger(singleField(formData, "reviewId"));
  const action = formAction(singleField(formData, "action"));
  if (reviewId === null || action === null) {
    return null;
  }
  if (action !== "link-other") {
    return { reviewId, request: { action } };
  }
  const productId = parsePositiveInteger(singleField(formData, "productId"));
  return productId === null ? null : { reviewId, request: { action, productId } };
}

function singleField(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  const [value] = values;
  return values.length === 1 && typeof value === "string" ? value : null;
}

function formAction(value: string | null): FormAction | null {
  return FORM_ACTIONS.find((member) => member === value) ?? null;
}

// The response crossed the network: its status is checked against the closed set, not trusted.
function noticeStatus(result: ResolutionResponse): NoticeStatus {
  const status = NOTICE_STATUSES.find((member) => member === result.status);
  if (status === undefined) {
    throw new Error(`review ${String(result.reviewId)} resolved to unexpected status ${result.status}`);
  }
  return status;
}
