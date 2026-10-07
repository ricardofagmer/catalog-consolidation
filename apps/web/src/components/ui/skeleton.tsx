import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

// Decorative placeholder: callers pair it with a visually hidden status message.
export function Skeleton({ className, ...props }: ComponentProps<"div">): ReactNode {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
