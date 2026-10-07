import type { ReactNode } from "react";
import type { ReviewReason } from "@catalog/api-client";
import { Badge } from "../ui/badge";

// AMBIGUOUS needs a choice between several products, so it stands out more than a single FUZZY match.
const REASON_VARIANTS = { AMBIGUOUS: "warning", FUZZY: "secondary" } as const satisfies Record<ReviewReason, string>;

export function ReasonBadge({ reason }: { readonly reason: ReviewReason }): ReactNode {
  return <Badge variant={REASON_VARIANTS[reason]}>{reason}</Badge>;
}
