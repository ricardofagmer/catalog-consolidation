import type { ReactNode } from "react";

const MISSING_VALUE = "(none)";

export function MissingValue(): ReactNode {
  return <span className="text-muted-foreground">{MISSING_VALUE}</span>;
}
