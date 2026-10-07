"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { matchNavItem, NAV_ITEMS, type NavMatch } from "./nav-items";

const ARIA_CURRENT: Readonly<Record<NavMatch, "page" | "true" | undefined>> = {
  page: "page",
  // A product page sits inside the catalog section without being the catalog page itself.
  section: "true",
  none: undefined,
};

export function NavLinks({ onNavigate }: { readonly onNavigate?: () => void }): ReactNode {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const match = matchNavItem(item, pathname);
        const isActive = match !== "none";
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={ARIA_CURRENT[match]}
              {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-sidebar-ring",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <item.icon aria-hidden="true" className={cn("size-4 shrink-0", isActive && "text-sidebar-primary")} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
