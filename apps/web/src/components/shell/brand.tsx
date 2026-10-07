import { Boxes } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Brand(): ReactNode {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight"
    >
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"
      >
        <Boxes className="size-4" />
      </span>
      Catalog consolidation
    </Link>
  );
}
