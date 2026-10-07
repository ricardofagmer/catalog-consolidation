"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

export interface ResolutionActivity {
  /** True while any resolve form on the page is submitting. */
  readonly pending: boolean;
  readonly hold: () => void;
  readonly release: () => void;
}

const IDLE: ResolutionActivity = { pending: false, hold: () => undefined, release: () => undefined };

const ResolutionActivityContext = createContext<ResolutionActivity>(IDLE);

/**
 * Page-wide pending state for review resolutions. A submitting button holds it until its form
 * settles, so every resolve button on the page is disabled while one resolution is in flight (the
 * redirect that follows re-renders the whole queue, and a second post would race it) and the notice
 * region empties, which makes a repeated notice a fresh change that is announced again.
 */
export function ResolutionActivityProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [holds, setHolds] = useState(0);
  // Stable callbacks: consumers list them as effect dependencies.
  const actions = useMemo(
    () => ({
      hold: (): void => setHolds((count) => count + 1),
      release: (): void => setHolds((count) => Math.max(0, count - 1)),
    }),
    [],
  );
  const value = useMemo(() => ({ pending: holds > 0, ...actions }), [holds, actions]);
  return <ResolutionActivityContext value={value}>{children}</ResolutionActivityContext>;
}

export function useResolutionActivity(): ResolutionActivity {
  return useContext(ResolutionActivityContext);
}
