import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface ErrorStateProps {
  readonly title: string;
  readonly description?: string;
  /** Server log digest that lets an operator find the matching entry; never an error message or stack. */
  readonly reference?: string;
  /** Usually a retry button. */
  readonly action?: ReactNode;
  /** Decorative icon; hidden from assistive technology. */
  readonly icon?: ReactNode;
  readonly className?: string;
}

// role="alert" because the state replaces content the reader was waiting for.
export function ErrorState({ title, description, reference, action, icon, className }: ErrorStateProps): ReactNode {
  return (
    <section
      role="alert"
      data-slot="error-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center text-card-foreground",
        className,
      )}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-muted text-destructive">
          {icon}
        </span>
      )}
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description === undefined ? null : <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {reference === undefined ? null : (
        <p className="font-mono text-xs text-muted-foreground">Reference: {reference}</p>
      )}
      {action === undefined ? null : <div className="pt-1">{action}</div>}
    </section>
  );
}
