import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">): ReactNode {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col gap-4 rounded-lg border bg-card py-4 text-card-foreground shadow-xs", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">): ReactNode {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1 px-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"div">): ReactNode {
  return <div data-slot="card-title" className={cn("font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"div">): ReactNode {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">): ReactNode {
  return <div data-slot="card-content" className={cn("px-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">): ReactNode {
  return <div data-slot="card-footer" className={cn("flex items-center px-4", className)} {...props} />;
}
