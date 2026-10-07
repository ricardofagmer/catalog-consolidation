"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import type { ReviewNotice } from "../lib/review-messages";
import { useResolutionActivity } from "./reviews/resolution-activity";
import { Alert, AlertDescription } from "./ui/alert";

function subscribeToNothing(): () => void {
  return () => undefined;
}

function isHydrated(): boolean {
  return true;
}

function isServer(): boolean {
  return false;
}

/**
 * Announces the outcome of a resolution. Both live regions are always rendered, empty in the server
 * HTML; the text enters only after hydration and is emptied while a resolution is pending, so every
 * notice reaches a region that already exists and a repeated notice (the same text twice, as with a
 * double submit) is a fresh change that screen readers announce again. The page keeps this
 * component in a stable position, and Next keeps page state across search-param navigations, so
 * the regions survive the redirect that follows a resolution.
 */
export function Notice({ notice }: { readonly notice: ReviewNotice | null }): ReactNode {
  const hydrated = useSyncExternalStore(subscribeToNothing, isHydrated, isServer);
  const { pending } = useResolutionActivity();
  const shown = hydrated && !pending ? notice : null;
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true">
        {shown?.kind === "success" ? <NoticeAlert notice={shown} /> : null}
      </div>
      {/* A refused resolution means the user's action did not happen: that needs immediate attention. */}
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {shown?.kind === "error" ? <NoticeAlert notice={shown} /> : null}
      </div>
      {notice === null ? null : (
        <noscript>
          <NoticeAlert notice={notice} />
        </noscript>
      )}
    </>
  );
}

function NoticeAlert({ notice }: { readonly notice: ReviewNotice }): ReactNode {
  const success = notice.kind === "success";
  return (
    <Alert variant={success ? "success" : "destructive"} className="mt-4">
      {success ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <AlertDescription className="text-current">
        <p>{notice.text}</p>
      </AlertDescription>
    </Alert>
  );
}
