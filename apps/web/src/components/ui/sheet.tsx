"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

type SheetSide = "left" | "right";

const SIDE_CLASS_NAMES: Readonly<Record<SheetSide, string>> = {
  left: "inset-y-0 left-0 border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  right: "inset-y-0 right-0 border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
};

// Radix Dialog supplies the modal behaviour a drawer needs: focus trap, focus restore on close,
// Escape to close, scroll lock and aria-modal.
export function Sheet(props: ComponentProps<typeof DialogPrimitive.Root>): ReactNode {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>): ReactNode {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export function SheetClose(props: ComponentProps<typeof DialogPrimitive.Close>): ReactNode {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

export type SheetContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  readonly side?: SheetSide;
  /** Accessible name of the icon-only close button. */
  readonly closeLabel: string;
};

export function SheetContent({ className, children, side = "left", closeLabel, ...props }: SheetContentProps): ReactNode {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-background/70 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex h-full w-72 max-w-[85vw] flex-col gap-4 bg-background text-foreground shadow-sm outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300",
          SIDE_CLASS_NAMES[side],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          title={closeLabel}
          className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X aria-hidden="true" className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">): ReactNode {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 p-4 pr-12", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>): ReactNode {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>): ReactNode {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
