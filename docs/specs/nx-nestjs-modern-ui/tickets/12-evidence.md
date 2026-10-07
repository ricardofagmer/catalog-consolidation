# Ticket 12 evidence: review queue UI and accessibility

Date 2026-10-06. Worker: frontend-coordinator (IMPLEMENT, risk low, A2). Not a git repo; no git writes.
Contracts followed: C-THEME rev1, C-SHELL rev1, C-STATES rev1 (no edits to layout, globals.css, `components/ui/*`,
`components/states/*`). Server Action contract (`resolveReviewAction`, fields `reviewId`, `action`, `productId`,
redirect query `notice|error|review|product`) unchanged; `actions.ts` not edited.
Scratch: `out/a11y-contrast/` (`contrast.mjs`, `table.md`, `compile-css.cjs`, `compiled.css`).
Not run by this worker (shared `apps/web/.next`): `next build`, `next start`, browser checks. Those are the
orchestrator's (list at the end).

## Files

| Change | Path (under `apps/web/`) |
|---|---|
| rewritten | `src/app/reviews/page.tsx` (header, tabs, provider + live notice, cards / table / empty state, pagination) |
| rewritten | `src/app/reviews/loading.tsx` (Skeleton primitive, mirrors the card layout) |
| rewritten | `src/components/ReviewCard.tsx` (`<article aria-labelledby>` around a Card) |
| rewritten | `src/components/SubmitButton.tsx` (page-wide pending, spinner + pending label, `accessibleName`) |
| rewritten | `src/components/Notice.tsx` (client; persistent `status` + `alert` live regions, `noscript` fallback) |
| edited | `src/components/StatusTabs.tsx` (solid focus outline class; markup unchanged) |
| edited | `src/lib/review-messages.ts` (`ReviewNotice` union + `reviewNotice()` mapper, `REVIEW_EMPTY_STATES`; message wording unchanged; `noticeMessage` now module-private) |
| new | `src/components/reviews/resolution-activity.tsx` (client context: page-wide pending hold/release) |
| new | `src/components/reviews/review-actions.tsx` (the four resolution forms) |
| new | `src/components/reviews/review-details.tsx` (Seller entry, candidate / live candidates, detail list) |
| new | `src/components/reviews/resolved-reviews-table.tsx` (LINKED / CREATED / REJECTED rows) |
| new | `src/components/reviews/reason-badge.tsx` (AMBIGUOUS = warning, FUZZY = secondary) |
| new | `src/components/reviews/accessible-names.ts` (review-specific names, product name shortening) |
| new | `src/components/reviews/focus-ring.ts` (solid token focus outline class) |
| edited | `next.config.ts` (only `Referrer-Policy` value `same-origin` + one-line WHY comment) |
| unchanged | `src/app/reviews/actions.ts`, `src/lib/catalog-api.ts`, `src/components/Pagination.tsx` |

`'use client'` modules in scope: `SubmitButton.tsx`, `Notice.tsx`, `reviews/resolution-activity.tsx`. Everything
else is a Server Component. Largest file: `review-actions.tsx`, 150 lines.

## Acceptance bullet 1: pending state and double submit

- Each resolution is still its own `<form action={resolveReviewAction}>` (same hidden fields as ticket 09).
- `SubmitButton` reads its own form with `useFormStatus()`; while pending it shows a `LoaderCircle`
  (`aria-hidden`, `motion-safe:animate-spin`) and the pending label ("Linking...", "Creating...", "Rejecting..."),
  sets `aria-busy="true"` and `disabled`.
- Page-wide: a pending button `hold()`s `ResolutionActivityProvider` in an effect and `release()`s in the cleanup
  (runs when the form settles or when the card unmounts after success). While any hold exists every
  `SubmitButton` on the page is `disabled`. Decision: page-wide instead of per-review, because the redirect that
  follows a resolution re-renders the whole queue and a second post on another card would race it; it is a strict
  superset of "every action button inside a review's form".
- Repeat of the same resolution: the guard covers hydrated double clicks; a stale tab or a pre-hydration post
  still reaches the API, which answers 409 `review_not_pending` (mapping unchanged), rendered as
  "This review was already resolved." in the alert region. No second link (the API refuses it; ticket 09 log
  `/v1/reviews/1/resolution 409`).

## Acceptance bullet 3: live region, names, focus

### Live-region design (and why)

Chosen: keep the redirect flow and render `Notice` (client) in a stable position: first child of
`ResolutionActivityProvider`, which is always rendered in the same place of the page tree for every status,
notice and empty/non-empty queue. Rejected alternative: switching to `useActionState`, which would change the
Server Action's return contract, needs its own list refresh and its own no-JS path; larger and less robust.

Why it persists: Next's layout router keys a page segment's React state without search params
(`node_modules/next/dist/client/components/layout-router.js:549`, `createRouterCacheKey(activeSegment, true) // no
search params`, comment "search params do not cause state to be lost"). The action redirects to
`/reviews?status=PENDING&notice=...` (same segment), so the live-region DOM nodes stay mounted and only their text
changes.

Why the region exists before it fills:
- Server HTML renders both regions EMPTY: `useSyncExternalStore` returns `false` on the server and during
  hydration, `true` after; text is rendered only when hydrated. So even a full-page load with `?notice=` (after a
  pre-hydration post) gets an empty region first and the text right after hydration.
- While a resolution is pending the regions are emptied (`pending` from the provider). When the redirect lands
  and the button releases, the text is inserted again, so a repeated identical notice (double submit / stale
  tab: "This review was already resolved." twice) is a fresh change and is announced again.
- Without JavaScript a `<noscript>` copy of the notice is shown (React renders `noscript` children on the server
  and does not hydrate them: `react-dom-client.production.js:15485` `shouldSetTextContent` includes `noscript`).

Region markup (always present, inside `<main id="main-content">` from the shell):

```html
<div role="status" aria-live="polite" aria-atomic="true">
  <!-- success only, after hydration -->
  <div data-slot="alert" class="... border-success/50 text-success mt-4">
    <svg aria-hidden="true">...</svg>
    <div data-slot="alert-description" class="... text-current"><p>Review 1 linked to product 21.</p></div>
  </div>
</div>
<div role="alert" aria-live="assertive" aria-atomic="true">
  <!-- refusal only: the user's action did not happen, which needs immediate attention -->
</div>
```

Success uses the Alert `success` variant, refusals the `destructive` variant. Texts come from
`lib/review-messages.ts`; the wording of every existing message is unchanged.

### Review card DOM and accessible names (review 12, FUZZY, candidate 21)

```
article  aria-labelledby="review-12-title"
  div[data-slot=card]
    div[data-slot=card-header]
      h2#review-12-title  "Review 12"            (page h1 "Review queue"; EmptyState also uses h2)
      span[data-slot=badge] "FUZZY"
    div[data-slot=card-content]  (2 columns from md)
      section aria-labelledby="review-12-seller"     h3 "Seller entry"       dl SourceName/SourceBrand/SourceCategory/Seller/SKU
      section aria-labelledby="review-12-candidate"  h3 "Candidate product"  dl Id/Name/Brand/Category/Score (formatScore)
                                                     (AMBIGUOUS: h3 "Live candidates" + ul "#id name (brand, category)")
    div[data-slot=card-footer]
      form > button  name=action value=link-candidate  visible "Link to candidate"
                     aria-label "Link to candidate product 21 (Router WiFi 6 TP-Link) for review 12"
      (AMBIGUOUS, per live candidate) form > button value=link-other + hidden productId
                     visible "Link to product 21"  aria-label "Link to product 21 (<name>) for review 12"
      form  label[for=review-12-product-id] "Product id" + sr-only " for review 12"  -> name "Product id for review 12"
            input#review-12-product-id type=number name=productId min=1 step=1 required
            button value=link-other  visible "Link to another product"  aria-label "Link to another product for review 12"
      form > button value=create   visible "Create new product"  aria-label "Create new product for review 12"
      form > button value=reject   visible "Reject"              aria-label "Reject review 12"
```

- Names start with the visible label (WCAG 2.5.3 label in name), which is why they read
  "Link to candidate product 21 (...) for review 12" rather than the brief's example word order
  "Link review 12 to candidate product 21 (...)": voice-control users can say what they see. Same content.
- Product names in names are whitespace-collapsed and cut at 48 code points with an ellipsis
  (`accessible-names.ts`); only catalog product names enter names, never seller free text. All text is rendered
  through React (escaped); no raw HTML (`react/no-danger` lint is on and passes).
- Status filter: `nav aria-label="Review status"` > `ul` > `a href="/reviews?status=X"`, `aria-current="page"` on
  the active one; the active tab also differs by border and weight, not by colour alone.
- Button variants: link to candidate = default (primary); live candidates and link other = outline; create =
  secondary; reject = outline with destructive text and border.
- Resolved tabs (LINKED / CREATED / REJECTED) keep the CLI-column table as today (Table primitive + reason
  badge): those items have no actions left, so cards would add nothing. Decision, recorded here.
- Empty tab: `EmptyState` (C-STATES) with an Inbox icon; copy from `REVIEW_EMPTY_STATES`
  ("No pending reviews" / "No linked reviews" / "No reviews created a product" / "No rejected reviews", each with
  a one-sentence explanation).
- Pagination: `Pagination` unchanged, same params as before.
- Loading: `loading.tsx` renders the h1, a visually hidden `role="status"` "Loading the review queue.", and
  `aria-hidden` Skeletons for the description, four tabs and two cards (header + badge, two bordered panels,
  action row).
- API error state: root `error.tsx` (shell worker), not touched.

### Visible focus

The primitives `button` and `input` carry `outline-none` and focus with `ring-ring/50`. Compiled Tailwind shows
`.outline-none { --tw-outline-style: none; outline-style: none }`, so the global `:focus-visible` outline from
`globals.css` is suppressed on them, and the 50% halo blends to 2.29:1 (light) / 2.45:1 (dark) against the card:
below 3:1. Every interactive element in this scope therefore adds `FOCUS_RING_CLASS_NAME`
(`focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`):
SubmitButton, the product id Input, the status tab links. `outline-solid` is required because `outline-2` reads
`var(--tw-outline-style)`, which `outline-none` sets to `none`. Verified in compiled CSS
(`out/a11y-contrast/compiled.css`, built with the app's `@tailwindcss/postcss` into scratch only): `.outline-none`
at line 956; `.focus-visible\:outline-2`, `-offset-2`, `-ring`, `-solid` at lines 1097-1113 (later in the
utilities layer, so they win on focus). `tailwind-merge` keeps all four next to `outline-none` (checked with
`twMerge`). No file in scope removes an outline.

## Acceptance bullet 4: reduced motion

- Only animation in scope: the pending spinner, `motion-safe:animate-spin` (compiled inside
  `@media (prefers-reduced-motion: no-preference)`, compiled.css:1195-1199), and the Skeleton primitive's
  `motion-safe:animate-pulse`.
- Button/input `transition-colors` / `transition-[color,box-shadow]` come from the primitives and are neutralised by
  the global rule in `globals.css` (`@media (prefers-reduced-motion: reduce)`: animation and transition durations
  0.01ms, compiled.css:1469). No `transition`/`animate` class is added by files in scope
  (`grep -nE "animate|transition"`: only the `motion-safe:animate-spin` above).

## Acceptance bullet 2: contrast (`node out/a11y-contrast/contrast.mjs`, tokens read from globals.css)

Translucent utilities are composited in sRGB over their surface. Text >= 4.5, non-text >= 3.

| Pair (where used) | Min | Light fg / bg | Light | Dark fg / bg | Dark |
|---|---|---|---|---|---|
| foreground on background (h1) | 4.5 | #18181b / #fafafa | 16.97 | #fafafa / #09090b | 19.06 |
| muted-foreground on background (page description, footer) | 4.5 | #52525b / #fafafa | 7.41 | #a1a1aa / #09090b | 7.76 |
| card-foreground on card (card text, detail values, table cells) | 4.5 | #18181b / #ffffff | 17.72 | #fafafa / #141417 | 17.61 |
| muted-foreground on card (dt labels, h3, empty description, caption, label) | 4.5 | #52525b / #ffffff | 7.73 | #a1a1aa / #141417 | 7.17 |
| foreground on card (outline buttons, active tab, input value) | 4.5 | #18181b / #ffffff | 17.72 | #fafafa / #141417 | 17.61 |
| accent-foreground on accent (outline/ghost hover) | 4.5 | #18181b / #eeeef1 | 15.30 | #fafafa / #27272a | 14.27 |
| primary-foreground on primary (Link to candidate) | 4.5 | #ffffff / #4f46e5 | 6.29 | #09090b / #818cf8 | 6.67 |
| primary-foreground on primary/90 over card (hover) | 4.5 | #ffffff / #6159e8 | 5.12 | #09090b / #7680e2 | 5.64 |
| secondary-foreground on secondary (Create, FUZZY badge) | 4.5 | #18181b / #f4f4f5 | 16.12 | #fafafa / #27272a | 14.27 |
| secondary-foreground on secondary/80 over card (Create hover) | 4.5 | #18181b / #f6f6f7 | 16.40 | #fafafa / #232326 | 15.02 |
| destructive on card (Reject, error notice) | 4.5 | #b91c1c / #ffffff | 6.47 | #f87171 / #141417 | 6.65 |
| destructive on accent (Reject hover) | 4.5 | #b91c1c / #eeeef1 | 5.59 | #f87171 / #27272a | 5.38 |
| primary on background (inactive tabs) | 4.5 | #4f46e5 / #fafafa | 6.02 | #818cf8 / #09090b | 6.67 |
| success on card (success notice) | 4.5 | #15803d / #ffffff | 5.02 | #4ade80 / #141417 | 10.55 |
| warning-foreground on warning (AMBIGUOUS badge) | 4.5 | #ffffff / #a16207 | 4.92 | #09090b / #fbbf24 | 11.92 |
| foreground on muted/50 over card (table row hover) | 4.5 | #18181b / #fafafa | 16.97 | #fafafa / #1e1e21 | 15.93 |
| muted-foreground on muted/50 over card (table row hover) | 4.5 | #52525b / #fafafa | 7.41 | #a1a1aa / #1e1e21 | 6.49 |
| muted-foreground on card (input placeholder; none rendered) | 4.5 | #52525b / #ffffff | 7.73 | #a1a1aa / #141417 | 7.17 |
| muted-foreground on muted (empty-state icon, non-text) | 3 | #52525b / #f4f4f5 | 7.03 | #a1a1aa / #27272a | 5.81 |
| ring on card (focus outline on card controls, incl. next to primary button) | 3 | #4f46e5 / #ffffff | 6.29 | #818cf8 / #141417 | 6.16 |
| ring on background (focus outline on tabs) | 3 | #4f46e5 / #fafafa | 6.02 | #818cf8 / #09090b | 6.67 |
| input on card (product id boundary) | 3 | #8a8a93 / #ffffff | 3.42 | #6b6b74 / #141417 | 3.48 |
| primary on background (active tab border) | 3 | #4f46e5 / #fafafa | 6.02 | #818cf8 / #09090b | 6.67 |
| primitive halo ring/50 over card (NOT relied on; see Visible focus) | 3 | #a7a3f2 / #ffffff | 2.29 FAIL | #4b5088 / #141417 | 2.45 FAIL |
| primitive halo ring/50 over background (NOT relied on) | 3 | #a5a0f0 / #fafafa | 2.26 FAIL | #454b82 / #09090b | 2.45 FAIL |

`pairs=29 failures(excluding primitive halo)=0`. Every text pair in scope >= 4.5:1 in both themes; the focus
indicator used in scope >= 6:1. Disabled (pending) buttons are exempt from 1.4.3.

## Acceptance bullet 5 (gates): scoped self-checks only

```
pnpm exec tsc -p apps/web/tsconfig.json --noEmit           -> exit 0 (listFiles includes all new components/reviews/* files)
cd apps/web && pnpm exec eslint src/app/reviews src/components/ReviewCard.tsx src/components/StatusTabs.tsx \
  src/components/SubmitButton.tsx src/components/Notice.tsx src/components/reviews src/lib/review-messages.ts next.config.ts
                                                            -> exit 0, no output
grep -nE "text-(muted|accent)([^-]|$)" (scope)              -> no match (ticket 10 known gap closed for the review page)
grep -nE "#hex|palette colour classes|dangerously| as [A-Z]|: any" (scope) -> no match
```
`next build`, web lint as a target and the runtime checks are left to the orchestrator.

## Referrer-Policy (ticket 09 finding)

`next.config.ts`: `{ key: "Referrer-Policy", value: "same-origin" }` with the comment
`// Not no-referrer: Chrome then posts pre-hydration Server Action forms with Origin: null, which Next rejects.`
Nothing else in the file changed. `same-origin` sends no Referer to other origins.

## For the orchestrator to verify in a browser (after `next build` + `next start`)

1. `curl -I /reviews` shows `Referrer-Policy: same-origin`; a no-JS POST (curl with the form's action id and a real
   `Origin`) still 303s; a click before hydration (throttled JS) no longer returns 500.
2. Pending: throttle the network, click "Link to candidate" on review 1: that button shows the spinner and
   "Linking...", has `aria-busy="true"`; every resolve button on the page is `disabled` until the redirect lands.
3. Double submit: two tabs on PENDING, resolve review 1 in tab A, then the same button in tab B: tab B shows
   "This review was already resolved." in `[role=alert]`; API log shows one 200 and one 409; product 21 has one
   new offer only. Repeat the click in tab B once more: the notice text is emptied while pending and re-inserted
   (announced again).
4. Live region: in the served HTML both `[role=status][aria-live=polite]` and `[role=alert]` exist and are empty;
   after a resolution the SAME element (check with a DOM breakpoint / `MutationObserver` or a screen reader)
   receives the text rather than a newly inserted region; verify `loading.tsx` does not replace the page during
   the action redirect (if it does, the regions remount and this design needs revisiting).
5. Names: accessibility tree for an item shows the names listed above, e.g. "Reject review 1",
   "Product id for review 1"; headings h1 > h2 "Review N" > h3.
6. Focus: Tab through tabs, buttons and the product id input in both themes: solid 2px indigo outline with a 2px
   offset on every control; the skip link (shell) is the first stop.
7. Reduced motion (DevTools rendering: prefers-reduced-motion reduce): no spinner rotation, no skeleton pulse,
   no hover transitions.
8. Empty tabs (`?status=REJECTED` on a fresh DB) show the designed empty state; pagination unchanged.

## Out of scope (reported, not changed)

- `components/ui/button.tsx` / `input.tsx` focus halo (`outline-none` + `ring-ring/50`) is 2.26-2.45:1 (< 3:1) for
  every other caller, for example `Pagination` (used on this page, frozen for this ticket), shell and catalog
  controls. Suggested owner fix: primitives use `focus-visible:ring-ring` (solid) or drop `outline-none` so the global
  `:focus-visible` outline applies. Owner: orchestrator (C-THEME primitives).
- Focus after a successful resolution: the resolved card unmounts, so focus falls back to the document; the outcome
  is announced by the live region. Moving focus deliberately (for example to the next card's heading) is a possible
  follow-up.
