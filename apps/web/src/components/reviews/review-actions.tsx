import type { ReactNode } from "react";
import type { ReviewItem } from "@catalog/api-client";
import { resolveReviewAction } from "../../app/reviews/actions";
import { cn } from "../../lib/utils";
import { SubmitButton } from "../SubmitButton";
import { buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  createProductName,
  linkCandidateName,
  linkLiveCandidateName,
  linkOtherName,
  rejectName,
} from "./accessible-names";
import { FOCUS_RING_CLASS_NAME } from "./focus-ring";

type FormAction = "link-candidate" | "link-other" | "create" | "reject";

const PRIMARY_BUTTON_CLASS_NAME = buttonVariants({ size: "sm" });
const OUTLINE_BUTTON_CLASS_NAME = buttonVariants({ variant: "outline", size: "sm" });
const SECONDARY_BUTTON_CLASS_NAME = buttonVariants({ variant: "secondary", size: "sm" });
// Outline with destructive text rather than a filled destructive button: reject is marked as the
// negative choice without outweighing the primary link action next to it.
const REJECT_BUTTON_CLASS_NAME = cn(
  OUTLINE_BUTTON_CLASS_NAME,
  "border-destructive/50 text-destructive hover:text-destructive",
);

const LINKING_LABEL = "Linking…";

/** The four resolutions of one PENDING review; field names and values are the action's contract. */
export function ReviewActions({ item }: { readonly item: ReviewItem }): ReactNode {
  const reviewId = item.id;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {item.candidateProductId === null ? null : (
        <ResolveForm
          reviewId={reviewId}
          action="link-candidate"
          className={PRIMARY_BUTTON_CLASS_NAME}
          accessibleName={linkCandidateName({
            reviewId,
            productId: item.candidateProductId,
            productName: item.candidate?.name ?? null,
          })}
          pendingLabel={LINKING_LABEL}
          label="Link to candidate"
        />
      )}
      {item.liveCandidates.map((candidate) => (
        <ResolveForm
          key={candidate.id}
          reviewId={reviewId}
          action="link-other"
          productId={candidate.id}
          className={OUTLINE_BUTTON_CLASS_NAME}
          accessibleName={linkLiveCandidateName({ reviewId, productId: candidate.id, productName: candidate.name })}
          pendingLabel={LINKING_LABEL}
          label={`Link to product ${String(candidate.id)}`}
        />
      ))}
      <LinkOtherForm reviewId={reviewId} />
      <ResolveForm
        reviewId={reviewId}
        action="create"
        className={SECONDARY_BUTTON_CLASS_NAME}
        accessibleName={createProductName(reviewId)}
        pendingLabel={"Creating…"}
        label="Create new product"
      />
      <ResolveForm
        reviewId={reviewId}
        action="reject"
        className={REJECT_BUTTON_CLASS_NAME}
        accessibleName={rejectName(reviewId)}
        pendingLabel={"Rejecting…"}
        label="Reject"
      />
    </div>
  );
}

function LinkOtherForm({ reviewId }: { readonly reviewId: number }): ReactNode {
  const inputId = `review-${String(reviewId)}-product-id`;
  return (
    <form action={resolveReviewAction} className="flex items-end gap-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <div className="flex flex-col gap-1.5">
        {/* Visible "Product id"; the hidden suffix makes the name unique per review. */}
        <Label htmlFor={inputId} className="text-muted-foreground">
          Product id<span className="sr-only">{` for review ${String(reviewId)}`}</span>
        </Label>
        <Input
          id={inputId}
          className={cn("h-8 w-32", FOCUS_RING_CLASS_NAME)}
          type="number"
          inputMode="numeric"
          name="productId"
          min="1"
          step="1"
          required
        />
      </div>
      <SubmitButton
        name="action"
        value="link-other"
        className={OUTLINE_BUTTON_CLASS_NAME}
        accessibleName={linkOtherName(reviewId)}
        pendingLabel={LINKING_LABEL}
      >
        Link to another product
      </SubmitButton>
    </form>
  );
}

function ResolveForm({
  reviewId,
  action,
  productId,
  className,
  accessibleName,
  pendingLabel,
  label,
}: {
  readonly reviewId: number;
  readonly action: FormAction;
  readonly productId?: number;
  readonly className: string;
  readonly accessibleName: string;
  readonly pendingLabel: string;
  readonly label: string;
}): ReactNode {
  return (
    <form action={resolveReviewAction}>
      <input type="hidden" name="reviewId" value={reviewId} />
      {productId === undefined ? null : <input type="hidden" name="productId" value={productId} />}
      <SubmitButton
        name="action"
        value={action}
        className={className}
        accessibleName={accessibleName}
        pendingLabel={pendingLabel}
      >
        {label}
      </SubmitButton>
    </form>
  );
}
