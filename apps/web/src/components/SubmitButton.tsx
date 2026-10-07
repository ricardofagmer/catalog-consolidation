"use client";

import { LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "../lib/utils";
import { FOCUS_RING_CLASS_NAME } from "./reviews/focus-ring";
import { useResolutionActivity } from "./reviews/resolution-activity";

export interface SubmitButtonProps {
  readonly name: string;
  readonly value: string;
  readonly className: string;
  /** Names the review and the target, so repeated buttons are distinguishable out of context. */
  readonly accessibleName: string;
  /** Visible text while this button's form is submitting, for example "Linking...". */
  readonly pendingLabel: string;
  readonly children: ReactNode;
}

/**
 * A submit button that is disabled while its form's action runs, and while any other resolution on
 * the page runs, so a double click cannot post the same resolution twice. It must render inside the
 * <form> whose status it reads. The API still refuses a second resolution (review_not_pending) for
 * posts made before hydration, when this guard is not active yet.
 */
export function SubmitButton({
  name,
  value,
  className,
  accessibleName,
  pendingLabel,
  children,
}: SubmitButtonProps): ReactNode {
  const { pending } = useFormStatus();
  const activity = useResolutionActivity();
  const { hold, release } = activity;

  useEffect(() => {
    if (!pending) {
      return undefined;
    }
    hold();
    // Runs when the form settles or when the card unmounts after a successful resolution.
    return release;
  }, [pending, hold, release]);

  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={cn(className, FOCUS_RING_CLASS_NAME, "disabled:cursor-wait")}
      disabled={pending || activity.pending}
      aria-busy={pending}
      aria-label={accessibleName}
    >
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
