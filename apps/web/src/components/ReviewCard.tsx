import type { ReactNode } from "react";
import type { ReviewItem } from "@catalog/api-client";
import { ReasonBadge } from "./reviews/reason-badge";
import { ReviewActions } from "./reviews/review-actions";
import { CandidateDetails, SellerEntry } from "./reviews/review-details";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";

/** One PENDING review: the seller's entry beside what the matcher proposed, then the resolutions. */
export function ReviewCard({ item }: { readonly item: ReviewItem }): ReactNode {
  const idPrefix = `review-${String(item.id)}`;
  return (
    <article aria-labelledby={`${idPrefix}-title`}>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-2">
          <h2 id={`${idPrefix}-title`} className="text-lg font-semibold leading-none">
            {`Review ${String(item.id)}`}
          </h2>
          <ReasonBadge reason={item.reason} />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <SellerEntry headingId={`${idPrefix}-seller`} item={item} />
          <CandidateDetails headingId={`${idPrefix}-candidate`} item={item} />
        </CardContent>
        <CardFooter className="border-t pt-4">
          <ReviewActions item={item} />
        </CardFooter>
      </Card>
    </article>
  );
}
