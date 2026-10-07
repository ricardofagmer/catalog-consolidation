import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Input({ className, type, ...props }: ComponentProps<"input">): ReactNode {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
