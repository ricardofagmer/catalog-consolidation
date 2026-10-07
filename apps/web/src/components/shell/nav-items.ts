import { ListChecks, Package, type LucideIcon } from "lucide-react";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Path prefixes of pages that belong to this section without being the link target itself. */
  readonly sectionPrefixes: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Catalog", icon: Package, sectionPrefixes: ["/products/"] },
  { href: "/reviews", label: "Review queue", icon: ListChecks, sectionPrefixes: ["/reviews/"] },
];

export type NavMatch = "page" | "section" | "none";

export function matchNavItem(item: NavItem, pathname: string): NavMatch {
  if (pathname === item.href) {
    return "page";
  }
  return item.sectionPrefixes.some((prefix) => pathname.startsWith(prefix)) ? "section" : "none";
}
