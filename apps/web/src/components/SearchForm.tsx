"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition, type ChangeEvent, type CompositionEvent, type ReactNode } from "react";
import { SEARCH_QUERY_MAX_LENGTH } from "../lib/search-params";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;
const HELPER_ID = "q-help";

// The search lives in the URL, so every result page is shareable and the form still works as a plain
// GET submit without JavaScript (Enter, any length: a lone text field submits implicitly). With
// JavaScript the URL is also updated while typing; replace keeps one history entry per search session
// instead of one per keystroke, and the input is uncontrolled so results re-rendering never steals its
// value or focus.
export function SearchForm({ query }: { readonly query: string | null }): ReactNode {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  // The query the page shows or is about to show, so an unchanged target never refetches.
  const targetRef = useRef(query);
  // Queries this form navigated to that the page has not rendered yet, oldest first.
  const sentRef = useRef<(string | null)[]>([]);

  const cancelTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancelTimer, [cancelTimer]);

  // A query change the user did not type (Clear search, browser back) must reach the input, while
  // the echo of our own navigation must not overwrite what is typed after it.
  useEffect(() => {
    const sentIndex = sentRef.current.indexOf(query);
    if (sentIndex >= 0) {
      sentRef.current.splice(0, sentIndex + 1);
      return;
    }
    if (query === targetRef.current) {
      return;
    }
    sentRef.current = [];
    targetRef.current = query;
    cancelTimer();
    if (inputRef.current !== null) {
      inputRef.current.value = query ?? "";
    }
  }, [query, cancelTimer]);

  function navigate(target: string | null): void {
    if (target === targetRef.current) {
      return;
    }
    targetRef.current = target;
    sentRef.current.push(target);
    startTransition(() => {
      router.replace(target === null ? "/" : `/?q=${encodeURIComponent(target)}`, { scroll: false });
    });
  }

  function scheduleSearch(value: string): void {
    cancelTimer();
    // Counted in code points, matching the server-side query parsing.
    const length = [...value.trim()].length;
    if (length > 0 && length < MIN_QUERY_LENGTH) {
      return;
    }
    const target = length === 0 ? null : value;
    timerRef.current = setTimeout(() => navigate(target), DEBOUNCE_MS);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    if (!isComposingRef.current) {
      scheduleSearch(event.currentTarget.value);
    }
  }

  function handleCompositionStart(): void {
    isComposingRef.current = true;
    cancelTimer();
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>): void {
    isComposingRef.current = false;
    scheduleSearch(event.currentTarget.value);
  }

  return (
    <form method="get" action="/" role="search" onSubmit={cancelTimer} className="flex flex-wrap items-end gap-2">
      <div className="flex w-full flex-col gap-1.5 sm:w-80">
        <Label htmlFor="q">Search products</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            id="q"
            name="q"
            type="search"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            defaultValue={query ?? ""}
            aria-describedby={HELPER_ID}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            className="pl-9"
          />
        </div>
      </div>
      {query === null ? null : (
        <Button asChild variant="ghost">
          <Link href="/">
            <X aria-hidden="true" />
            Clear search
          </Link>
        </Button>
      )}
      <p id={HELPER_ID} className="w-full text-xs text-muted-foreground">
        Type at least {MIN_QUERY_LENGTH} characters to filter as you type.
      </p>
      <span role="status" className="sr-only">
        {isPending ? "Updating results" : ""}
      </span>
    </form>
  );
}
