import { ChevronRight, ChevronsLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

export interface PaginationProps {
  readonly basePath: string;
  // The page's other params (filters, status, sort); the cursor param is owned here and ignored if present.
  readonly params: Readonly<Record<string, string>>;
  readonly nextCursor: number | null;
  readonly isFirstPage: boolean;
  /** Keyset lists page by `after` (the last id seen); a list sorted by any column pages by `offset`. */
  readonly cursorParam?: "after" | "offset";
}

export function Pagination({
  basePath,
  params,
  nextCursor,
  isFirstPage,
  cursorParam = "after",
}: PaginationProps): ReactNode {
  // An empty navigation landmark is noise for screen-reader users.
  if (isFirstPage && nextCursor === null) {
    return null;
  }
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-end gap-2">
      {isFirstPage ? null : (
        <Button asChild variant="outline" size="sm">
          <Link href={pageHref({ basePath, params, cursorParam, cursor: null })}>
            <ChevronsLeft aria-hidden="true" />
            First page
          </Link>
        </Button>
      )}
      {nextCursor === null ? null : (
        <Button asChild variant="outline" size="sm">
          <Link href={pageHref({ basePath, params, cursorParam, cursor: nextCursor })}>
            Next
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </nav>
  );
}

function pageHref(args: {
  basePath: string;
  params: Readonly<Record<string, string>>;
  cursorParam: string;
  cursor: number | null;
}): string {
  const search = new URLSearchParams(Object.entries(args.params).filter(([key]) => key !== args.cursorParam));
  if (args.cursor !== null) {
    search.set(args.cursorParam, String(args.cursor));
  }
  const query = search.toString();
  return query === "" ? args.basePath : `${args.basePath}?${query}`;
}
