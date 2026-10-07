import type { ReactNode } from "react";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

// Desktop only: below `md` the same links live in the drawer (MobileNav), so exactly one "Main"
// navigation landmark is ever exposed.
export function AppSidebar(): ReactNode {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
        <NavLinks />
      </nav>
    </aside>
  );
}
