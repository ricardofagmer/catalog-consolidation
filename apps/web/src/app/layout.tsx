import "@fontsource-variable/inter";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppSidebar } from "../components/shell/app-sidebar";
import { MAIN_CONTENT_ID, SkipLink } from "../components/shell/skip-link";
import { TopBar } from "../components/shell/top-bar";
import { ThemeProvider } from "../components/theme/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catalog consolidation",
  description: "Browse the consolidated catalog and resolve the match review queue.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  // next-themes sets the theme class and color-scheme on <html> before hydration, so the server
  // markup legitimately differs there.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <SkipLink />
          <div className="flex min-h-dvh">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              {/* tabIndex -1 lets the skip link move focus here; the outline is suppressed because
                  the landmark itself is not an interactive control. */}
              <main
                id={MAIN_CONTENT_ID}
                tabIndex={-1}
                className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none md:px-8 md:py-8"
              >
                {children}
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
