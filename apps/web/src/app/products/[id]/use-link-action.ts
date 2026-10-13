"use client";

import { useState, useTransition } from "react";
import type { SellerLinkActionResult } from "./seller-link-result";

export interface LinkAction {
  readonly pending: boolean;
  /** The refusal message of the last attempt; cleared when a new attempt starts. */
  readonly error: string | null;
  readonly run: (args: { readonly work: () => Promise<SellerLinkActionResult>; readonly onSuccess?: () => void }) => void;
}

/** Runs one server action in a transition and keeps its pending state and refusal message. */
export function useLinkAction(): LinkAction {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(args: { readonly work: () => Promise<SellerLinkActionResult>; readonly onSuccess?: () => void }): void {
    setError(null);
    startTransition(async () => {
      const result = await args.work();
      // State set after an await is no longer inside the transition, so it is wrapped again.
      startTransition(() => {
        if (result.ok) {
          args.onSuccess?.();
        } else {
          setError(result.message);
        }
      });
    });
  }

  return { pending, error, run };
}
