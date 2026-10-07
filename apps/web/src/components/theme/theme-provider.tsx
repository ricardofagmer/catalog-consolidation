"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Class-based theming. next-themes renders a blocking inline script as its first child, so the
 * stored (or system) theme class is on <html> before the content after it paints.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
    >
      {children}
    </NextThemesProvider>
  );
}
