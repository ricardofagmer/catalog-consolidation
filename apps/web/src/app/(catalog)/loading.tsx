import type { ReactNode } from "react";
import { Card } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";

const SKELETON_TILES = [0, 1, 2] as const;
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export default function CatalogLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        Loading the catalog
      </p>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SKELETON_TILES.map((tile) => (
            <Card key={tile} className="gap-3 px-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex w-full flex-col gap-1.5 sm:w-80">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-20" />
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
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
