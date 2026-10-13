import type { ReactNode } from "react";
import type { MatchType } from "@catalog/api-client";
import { cn } from "../lib/utils";
import { Badge, type BadgeProps } from "./ui/badge";

// Automatic matches read as success (EXACT strongest); human or creation outcomes stay neutral.
// Outline success keeps success text on the card surface, a contrast-checked pair.
const MATCH_TYPE_BADGES: Readonly<Record<MatchType, { variant: BadgeProps["variant"]; className?: string }>> = {
  EXACT: { variant: "success" },
  NORMALIZED: { variant: "outline", className: "border-success text-success" },
  CREATED: { variant: "secondary" },
  REVIEWED: { variant: "outline" },
};

export function MatchTypeBadge({ matchType }: { readonly matchType: MatchType }): ReactNode {
  const badge = MATCH_TYPE_BADGES[matchType];
  return (
    <Badge variant={badge.variant} className={cn("font-mono", badge.className)}>
      {matchType}
    </Badge>
  );
}
