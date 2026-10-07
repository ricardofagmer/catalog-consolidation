import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

// No default role: a notice that must be announced passes role/aria-live from the caller, so the
// live region can exist before it fills.
export const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border bg-card px-4 py-3 text-sm shadow-xs has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "text-card-foreground",
        success: "border-success/50 text-success",
        warning: "border-warning/50 text-warning",
        destructive: "border-destructive/50 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps): ReactNode {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<"div">): ReactNode {
  return (
    <div data-slot="alert-title" className={cn("col-start-2 font-medium tracking-tight", className)} {...props} />
  );
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">): ReactNode {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}
