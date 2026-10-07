"use client";

import { RotateCw, ServerCrash } from "lucide-react";
import type { ReactNode } from "react";
import { ErrorState } from "../components/states/error-state";
import { Button } from "../components/ui/button";

// error.message and the stack never reach the browser; the digest lets an operator find the
// matching server log entry.
export default function ErrorPage({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}): ReactNode {
  // ErrorState titles are h2, so the page heading is supplied for screen-reader navigation.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Error</h1>
      <ErrorState
        icon={<ServerCrash />}
        title="The catalog service is not reachable"
        description="The data for this page could not be loaded. Wait a moment, then try again."
        {...(error.digest === undefined ? {} : { reference: error.digest })}
        action={
          <Button type="button" onClick={reset}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        }
      />
    </div>
  );
}
