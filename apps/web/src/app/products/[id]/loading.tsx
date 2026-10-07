import type { ReactNode } from "react";
import { Card } from "../../../components/ui/card";
import { Skeleton } from "../../../components/ui/skeleton";

const SKELETON_FACTS = [0, 1, 2, 3, 4] as const;
const SKELETON_ROWS = [0, 1, 2, 3] as const;

export default function ProductLoading(): ReactNode {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        Loading the product
      </p>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Card className="px-4">
          <Skeleton className="h-5 w-40" />
          <div className="flex flex-col gap-2">
            {SKELETON_FACTS.map((fact) => (
              <div key={fact} className="flex gap-6">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-28" />
          <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
            <div className="border-b px-3 py-3">
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex flex-col divide-y">
              {SKELETON_ROWS.map((row) => (
                <div key={row} className="flex items-center gap-6 px-3 py-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
