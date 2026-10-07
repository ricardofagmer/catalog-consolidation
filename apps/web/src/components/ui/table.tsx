import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Table({ className, ...props }: ComponentProps<"table">): ReactNode {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-top border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">): ReactNode {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">): ReactNode {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">): ReactNode {
  return (
    <tr data-slot="table-row" className={cn("border-b transition-colors hover:bg-muted/50", className)} {...props} />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">): ReactNode {
  return (
    <th
      data-slot="table-head"
      className={cn("h-10 whitespace-nowrap px-3 text-left align-middle font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">): ReactNode {
  return <td data-slot="table-cell" className={cn("px-3 py-2 align-top", className)} {...props} />;
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">): ReactNode {
  return (
    <caption data-slot="table-caption" className={cn("mb-2 text-left text-sm text-muted-foreground", className)} {...props} />
  );
}
