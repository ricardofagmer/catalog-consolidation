import type { ReactNode } from "react";
import { Skeleton } from "../../components/ui/skeleton";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

// Mirrors the page: header, then the table (caption, header row, link rows).
export default function SellerLinksLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        Loading the seller links
      </p>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
          <div className="border-b px-3 py-3">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex gap-6 border-b bg-muted/50 px-3 py-3">
            <Skeleton className="h-4 w-10 bg-border" />
            <Skeleton className="h-4 w-32 bg-border" />
            <Skeleton className="h-4 w-20 bg-border" />
          </div>
          <div className="flex flex-col divide-y">
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="flex items-center gap-6 px-3 py-3">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="hidden h-4 w-28 sm:block" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
