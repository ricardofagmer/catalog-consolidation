import type { ReactNode } from "react";
import { Skeleton } from "../../components/ui/skeleton";

const SKELETON_CARD_COUNT = 2;
const SKELETON_TAB_COUNT = 4;
const SKELETON_ACTION_WIDTHS = ["w-32", "w-44", "w-36", "w-20"];

// Mirrors the page: header, status tabs, then review cards (header, two detail panels, action row).
export default function ReviewsLoading(): ReactNode {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading the review queue.
      </p>
      <h1 className="text-2xl font-semibold">Review queue</h1>
      <Skeleton className="mt-2 h-4 w-2/3" />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: SKELETON_TAB_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24" />
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-4">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </div>
  );
}

function SkeletonCard(): ReactNode {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 rounded-lg border bg-card py-4 shadow-xs">
      <div className="flex items-center gap-2 px-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="grid gap-4 px-4 md:grid-cols-2">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
      <div className="flex flex-wrap gap-2 border-t px-4 pt-4">
        {SKELETON_ACTION_WIDTHS.map((width) => (
          <Skeleton key={width} className={`h-8 ${width}`} />
        ))}
      </div>
    </div>
  );
}

function SkeletonPanel(): ReactNode {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
