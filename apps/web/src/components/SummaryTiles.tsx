import { Inbox, Link2, Package, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Summary } from "@catalog/api-client";
import { Card } from "./ui/card";

// The link's ::after covers the whole card, so the count is clickable too, and the focus ring is
// drawn on that overlay rather than around the label text alone.
const TILE_LINK_CLASS_NAME =
  "outline-none after:absolute after:inset-0 after:rounded-lg hover:text-foreground focus-visible:after:outline-solid focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring";

export function SummaryTiles({ counts }: { readonly counts: Summary }): ReactNode {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <SummaryTile label="Products" count={counts.products} icon={Package} href="/#products" />
      <SummaryTile label="Seller links" count={counts.sellerOffers} icon={Link2} href="/seller-links" />
      <SummaryTile
        label="Pending reviews"
        count={counts.pendingReviews}
        icon={Inbox}
        href="/reviews?status=PENDING"
      />
    </dl>
  );
}

function SummaryTile({
  label,
  count,
  icon: Icon,
  href,
}: {
  readonly label: string;
  readonly count: number;
  readonly icon: LucideIcon;
  readonly href: string;
}): ReactNode {
  // The count is the only child of its <dd>: the verification scrapes `<dd ...>N</dd>`. The link
  // therefore lives in <dt> and is stretched over the card instead of wrapping the count.
  return (
    <Card className="relative gap-2 px-4 transition-colors hover:border-primary">
      <dt className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
        <Link href={href} className={TILE_LINK_CLASS_NAME}>
          {label}
        </Link>
        <Icon aria-hidden="true" className="size-4" />
      </dt>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums">{count}</dd>
    </Card>
  );
}
