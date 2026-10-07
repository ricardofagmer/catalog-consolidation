import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

// The caller supplies htmlFor (or nests the control); this primitive only styles the label.
export function Label({ className, ...props }: ComponentProps<"label">): ReactNode {
  return (
    <label
      data-slot="label"
      className={cn("flex select-none items-center gap-2 text-sm font-medium leading-none", className)}
      {...props}
    />
  );
}
