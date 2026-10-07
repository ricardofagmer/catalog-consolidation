import type { ReactNode } from "react";

export const MAIN_CONTENT_ID = "main-content";

// Visually hidden until focused; it must stay the first focusable element in <body> (C-SHELL).
export function SkipLink(): ReactNode {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-sm"
    >
      Skip to main content
    </a>
  );
}
