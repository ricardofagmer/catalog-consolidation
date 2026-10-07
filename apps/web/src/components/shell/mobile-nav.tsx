"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";
import { NavLinks } from "./nav-links";

export function MobileNav(): ReactNode {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [openedOnPathname, setOpenedOnPathname] = useState(pathname);

  // Any route change closes the drawer, including back/forward; adjusting state during render
  // avoids an extra effect pass and a flash of the open drawer on the new page.
  if (pathname !== openedOnPathname) {
    setOpenedOnPathname(pathname);
    setIsOpen(false);
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" title="Open navigation">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel="Close navigation" className="bg-sidebar text-sidebar-foreground md:hidden">
        <SheetHeader className="border-b border-sidebar-border">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription className="sr-only">Pages of the catalog consolidation app.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Main" className="px-3">
          {/* A click on the current page's link changes no route, so it closes the drawer itself. */}
          <NavLinks onNavigate={() => setIsOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
