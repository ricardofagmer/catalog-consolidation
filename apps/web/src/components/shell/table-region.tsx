import type { ReactNode } from "react";

// The scroll container is focusable so keyboard users can scroll a table wider than the screen,
// and it is named by the table caption so screen readers announce what the region holds.
// scroll-mt keeps a `#id` jump to the region from landing under the sticky top bar.
export function TableRegion({
  labelledBy,
  id,
  children,
}: {
  readonly labelledBy: string;
  /** Fragment target, for links that open the page on this table. */
  readonly id?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      tabIndex={0}
      className="relative w-full scroll-mt-20 overflow-x-auto rounded-lg border bg-card text-card-foreground shadow-xs"
    >
      {children}
    </div>
  );
}
