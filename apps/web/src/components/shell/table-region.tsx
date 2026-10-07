import type { ReactNode } from "react";

// The scroll container is focusable so keyboard users can scroll a table wider than the screen,
// and it is named by the table caption so screen readers announce what the region holds.
export function TableRegion({
  labelledBy,
  children,
}: {
  readonly labelledBy: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div
      role="region"
      aria-labelledby={labelledBy}
      tabIndex={0}
      className="relative w-full overflow-x-auto rounded-lg border bg-card text-card-foreground shadow-xs"
    >
      {children}
    </div>
  );
}
