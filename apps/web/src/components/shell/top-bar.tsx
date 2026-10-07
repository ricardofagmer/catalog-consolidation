import type { ReactNode } from "react";
import { ThemeToggle } from "../theme/theme-toggle";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";

export function TopBar(): ReactNode {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:px-8">
        <MobileNav />
        <div className="md:hidden">
          <Brand />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
