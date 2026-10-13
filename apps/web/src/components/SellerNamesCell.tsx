"use client";

import { useState, type ReactNode } from "react";

// Sellers shown before the rest collapse behind the three-dot toggle.
const VISIBLE_SELLERS = 2;
const MISSING_VALUE = "(none)";

/** Seller names for one product: the first few inline, the rest behind a three-dot toggle. */
export function SellerNamesCell({ names }: { readonly names: readonly string[] }): ReactNode {
  const [expanded, setExpanded] = useState(false);

  if (names.length === 0) {
    return <span className="text-muted-foreground">{MISSING_VALUE}</span>;
  }

  const collapsible = names.length > VISIBLE_SELLERS;
  const shown = expanded || !collapsible ? names : names.slice(0, VISIBLE_SELLERS);
  const hidden = names.length - VISIBLE_SELLERS;

  return (
    <span>
      {shown.join(", ")}
      {collapsible ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Show fewer sellers" : `Show ${String(hidden)} more sellers`}
          className="ml-1 rounded px-1 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "less" : "…"}
        </button>
      ) : null}
    </span>
  );
}
