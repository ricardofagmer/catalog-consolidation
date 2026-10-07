import { ChevronRight, ChevronsLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

const AFTER_PARAM = "after";

export interface PaginationProps {
  readonly basePath: string;
  // The page's other params (filters, status); `after` is owned here and ignored if present.
  readonly params: Readonly<Record<string, string>>;
  readonly nextAfterId: number | null;
  readonly isFirstPage: boolean;
}

export function Pagination({ basePath, params, nextAfterId, isFirstPage }: PaginationProps): ReactNode {
  // An empty navigation landmark is noise for screen-reader users.
  if (isFirstPage && nextAfterId === null) {
    return null;
  }
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-end gap-2">
      {isFirstPage ? null : (
        <Button asChild variant="outline" size="sm">
          <Link href={pageHref({ basePath, params, afterId: null })}>
            <ChevronsLeft aria-hidden="true" />
            First page
          </Link>
        </Button>
      )}
      {nextAfterId === null ? null : (
        <Button asChild variant="outline" size="sm">
          <Link href={pageHref({ basePath, params, afterId: nextAfterId })}>
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
  afterId: number | null;
}): string {
  const search = new URLSearchParams(Object.entries(args.params).filter(([key]) => key !== AFTER_PARAM));
  if (args.afterId !== null) {
    search.set(AFTER_PARAM, String(args.afterId));
  }
  const query = search.toString();
  return query === "" ? args.basePath : `${args.basePath}?${query}`;
}
