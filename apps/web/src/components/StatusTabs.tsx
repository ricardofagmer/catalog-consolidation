import Link from "next/link";
import type { ReactNode } from "react";
import type { ReviewStatus } from "@catalog/api-client";
import { REVIEW_STATUSES } from "../lib/search-params";
import { cn } from "../lib/utils";
import { FOCUS_RING_CLASS_NAME } from "./reviews/focus-ring";
import { buttonVariants } from "./ui/button";

// The active tab differs by border and weight as well as colour, so it is not signalled by hue alone.
const ACTIVE_TAB_CLASS_NAME = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  "border-primary font-semibold text-foreground",
  FOCUS_RING_CLASS_NAME,
);
const INACTIVE_TAB_CLASS_NAME = cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-primary", FOCUS_RING_CLASS_NAME);

/** Status filter as plain links: each status is its own URL, so it works without JavaScript and can be shared. */
export function StatusTabs({ active }: { readonly active: ReviewStatus }): ReactNode {
  return (
    <nav aria-label="Review status">
      <ul className="flex flex-wrap gap-2">
        {REVIEW_STATUSES.map((status) => (
          <li key={status}>
            <Link
              className={status === active ? ACTIVE_TAB_CLASS_NAME : INACTIVE_TAB_CLASS_NAME}
              href={`/reviews?status=${status}`}
              aria-current={status === active ? "page" : undefined}
            >
              {status}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
