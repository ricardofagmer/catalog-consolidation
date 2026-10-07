import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import type { ReviewStatus } from "@catalog/api-client";
import { Notice } from "../../components/Notice";
import { Pagination } from "../../components/Pagination";
import { ReviewCard } from "../../components/ReviewCard";
import { ResolutionActivityProvider } from "../../components/reviews/resolution-activity";
import { ResolvedReviewsTable } from "../../components/reviews/resolved-reviews-table";
import { EmptyState } from "../../components/states/empty-state";
import { StatusTabs } from "../../components/StatusTabs";
import { listReviews } from "../../lib/catalog-api";
import { REVIEW_EMPTY_STATES, reviewNotice } from "../../lib/review-messages";
import { parseReviewSearchParams, type RawSearchParams, type ReviewSearchParams } from "../../lib/search-params";

// The queue changes under the page (CLI runs, other tabs); it is never prerendered or cached.
export const dynamic = "force-dynamic";

export default async function ReviewsPage({
  searchParams,
}: {
  readonly searchParams: Promise<RawSearchParams>;
}): Promise<ReactNode> {
  const params = parseReviewSearchParams(await searchParams);
  const page = await listReviews({ status: params.status, afterId: params.afterId, limit: params.limit });
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Seller entries the matcher could not link with certainty. Compare each entry with its candidate and
          choose a resolution.
        </p>
      </header>
      <div className="mt-6">
        <StatusTabs active={params.status} />
      </div>
      {/* The provider and the notice stay first in the same position for every status and notice, so
          React keeps the live regions mounted across the redirect that follows a resolution. */}
      <ResolutionActivityProvider>
        <Notice notice={reviewNotice(params)} />
        <div className="mt-6">
          {page.items.length === 0 ? (
            <EmptyQueue status={params.status} />
          ) : params.status === "PENDING" ? (
            <div className="flex flex-col gap-4">
              {page.items.map((item) => (
                <ReviewCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <ResolvedReviewsTable status={params.status} items={page.items} />
          )}
        </div>
      </ResolutionActivityProvider>
      <Pagination
        basePath="/reviews"
        params={paginationParams(params)}
        nextAfterId={page.nextCursor}
        isFirstPage={params.afterId === 0}
      />
      <footer className="mt-8 border-t pt-3 text-sm text-muted-foreground">
        Local demo: no login. Anyone who can reach 127.0.0.1:3000 can resolve reviews.
      </footer>
    </>
  );
}

function EmptyQueue({ status }: { readonly status: ReviewStatus }): ReactNode {
  const copy = REVIEW_EMPTY_STATES[status];
  return <EmptyState title={copy.title} description={copy.description} icon={<Inbox />} />;
}

function paginationParams(params: ReviewSearchParams): Record<string, string> {
  return params.limit === null
    ? { status: params.status }
    : { status: params.status, limit: String(params.limit) };
}
