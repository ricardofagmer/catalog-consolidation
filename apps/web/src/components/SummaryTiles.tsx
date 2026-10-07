import { Inbox, Link2, Package, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Summary } from "@catalog/api-client";
import { Card } from "./ui/card";

export function SummaryTiles({ counts }: { readonly counts: Summary }): ReactNode {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <SummaryTile label="Products" count={counts.products} icon={Package} />
      <SummaryTile label="Seller links" count={counts.sellerOffers} icon={Link2} />
      <SummaryTile label="Pending reviews" count={counts.pendingReviews} icon={Inbox} />
    </dl>
  );
}

function SummaryTile({
  label,
  count,
  icon: Icon,
}: {
  readonly label: string;
  readonly count: number;
  readonly icon: LucideIcon;
}): ReactNode {
  // The count is the only child of its <dd>: the verification scrapes `<dd ...>N</dd>`.
  return (
    <Card className="gap-2 px-4">
      <dt className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
        {label}
        <Icon aria-hidden="true" className="size-4" />
      </dt>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums">{count}</dd>
    </Card>
  );
}
