import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  /** Decorative icon; hidden from assistive technology. */
  readonly icon?: ReactNode;
  /** A link or button that offers the next step, for example clearing a search. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps): ReactNode {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-12 text-center text-card-foreground",
        className,
      )}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </span>
      )}
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description === undefined ? null : <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action === undefined ? null : <div className="pt-1">{action}</div>}
    </section>
  );
}
