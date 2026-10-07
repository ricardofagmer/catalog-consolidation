import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  children,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Optional slot above the title, for a breadcrumb or back link. */
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      {children}
      <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{title}</h1>
      {description === undefined ? null : <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
