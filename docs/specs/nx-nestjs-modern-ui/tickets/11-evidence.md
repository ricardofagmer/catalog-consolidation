# Ticket 11 evidence: app shell and page states

Date 2026-10-07. Worker: frontend-coordinator (IMPLEMENT, risk low, A2). Contracts honoured verbatim:
C-THEME rev1, C-SHELL rev1, C-STATES rev1. Frozen files (`components/ui/*` except the new `sheet.tsx`,
`components/states/*`) were not edited. Data layer (`lib/**`), `find-product.ts` and the product
`layout.tsx` (404 trigger) are unchanged; pages call the same `lib/catalog-api` functions.

## Files

New:
- `apps/web/src/components/ui/sheet.tsx` (Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription on `@radix-ui/react-dialog`)
- `apps/web/src/components/shell/{nav-items.ts,nav-links.tsx,brand.tsx,app-sidebar.tsx,mobile-nav.tsx,top-bar.tsx,skip-link.tsx,page-header.tsx,table-region.tsx}`
- `apps/web/src/app/products/[id]/{match-type-badge.tsx,missing-value.tsx,product-facts.tsx,seller-links-table.tsx}`

Rewritten:
- `apps/web/src/app/layout.tsx`, `apps/web/src/app/error.tsx`, `apps/web/src/app/not-found.tsx`, `apps/web/src/app/products/not-found.tsx`
- `apps/web/src/app/(catalog)/{page,loading}.tsx`, `apps/web/src/app/products/[id]/{page,loading}.tsx`
- `apps/web/src/components/{ProductsTable,SummaryTiles,SearchForm,Pagination}.tsx`

Not touched: `globals.css` (no new token or utility needed).

## Component tree

```
RootLayout (server) html[lang=en, suppressHydrationWarning] > body
  ThemeProvider (client, ticket 10)         next-themes script stays first in body
    SkipLink                                <a href="#main-content"> first focusable element
    div.flex.min-h-dvh
      AppSidebar (server, hidden < md)      aside.bg-sidebar > Brand + nav[aria-label=Main] > NavLinks (client)
      div.flex-1
        TopBar (server, sticky)             header > MobileNav (client, md:hidden) + Brand (md:hidden) + ThemeToggle
          MobileNav                         Sheet > SheetTrigger(Button "Open navigation")
                                            SheetContent(side left, closeLabel "Close navigation")
                                              SheetTitle "Navigation" + sr-only SheetDescription
                                              nav[aria-label=Main] > NavLinks(onNavigate closes)
        main#main-content[tabIndex=-1].max-w-6xl   the single <main> (C-SHELL)
          {page | loading | error | not-found}
```

Client components: `nav-links.tsx` (usePathname), `mobile-nav.tsx` (open state), `ui/sheet.tsx` (Radix),
`app/error.tsx` (required by Next). Everything else is a Server Component.

## Acceptance bullets

1. Desktop sidebar + top bar; drawer below `md`.
   - Sidebar: `hidden md:flex`, `w-60`, sticky full height, sidebar tokens; links Catalog (Package icon) and
     Review queue (ListChecks icon). `aria-current="page"` on the exact route (`/`, `/reviews`);
     `aria-current="true"` plus the active look on section pages (`/products/*` under Catalog).
   - Top bar: sticky, opaque `bg-background`, `ThemeToggle` on the right, width aligned with `max-w-6xl` content.
   - Drawer: menu Button `md:hidden`, accessible name "Open navigation"; Radix Trigger sets
     `aria-expanded`/`aria-controls`. Sheet = Radix Dialog: overlay, focus trap, focus restored to the trigger,
     Escape closes, scroll lock, title "Navigation", close button "Close navigation". Route change closes it
     (pathname compared during render, so back/forward also closes); a click on the current page's link closes
     it through `onNavigate`. Only one `nav[aria-label=Main]` is exposed at a time (sidebar is `display:none`
     below md, the drawer content is only mounted while open).
   - Skip link: first child of the provider, `sr-only` until focused, then a primary pill at top-left; targets
     `#main-content`.
2. Loading files and empty states.
   - `app/(catalog)/loading.tsx`: header, three Card tiles, search field, table card with caption, header row and
     8 rows; `role="status"` sr-only text + `aria-busy`. Renders inside the shell (root layout wraps it).
   - `app/products/[id]/loading.tsx`: breadcrumb, title, facts Card, sellers table card.
   - Empty search: `EmptyState` (SearchX icon) "No products match your search", description quoting the query
     as React text (escaped), action "Clear search" -> `/`. Empty catalog and past-the-end pages use
     `EmptyState` too. The search form also shows a "Clear search" ghost button while a query is active.
   - Product with no sellers: `EmptyState` titled "No seller is linked to this product yet." (wording kept).
   - Empty review status tab: ticket 12 scope (review page).
3. Error state: `app/error.tsx` renders `ErrorState` (ServerCrash icon) "The catalog service is not reachable",
   description "The data for this page could not be loaded. Wait a moment, then try again.", `reference` =
   `error.digest` only when present, Button "Try again" calling `reset`. `error.message`/stack are never
   rendered (grep below). It sits at the root segment, so it also catches the product layout's API failure and
   keeps the shell visible.
4. Same data: tiles keep labels Products / Seller links / Pending reviews and each count stays the only child
   of its `<dd>` (scrape contract). Products table keeps Id, Name (link `/products/{id}`), Brand, Category,
   Sellers and `(none)` placeholders; caption text unchanged ("Products" / "Products matching “q”").
   Pagination keeps `PaginationProps`, exports, link text and hrefs (icons are `aria-hidden`). Product page
   keeps the five facts, every seller link with SellerName, SellerProductId, SourceName, SourceBrand,
   SourceCategory, MatchType, `whitespace-pre-wrap` for stored text, `(none)` placeholder and
   "Showing the first 100 seller links." when `hasMore`. Not-found pages keep their headline text and the
   "Back to the catalog" link; 404 is still produced by the unchanged `notFound()` calls.
5. Themes/tokens: only token utilities. Match badges: EXACT `success` (filled), NORMALIZED outline with
   `text-success border-success`, CREATED `secondary`, REVIEWED `outline`. Table rows override the
   primitive's `hover:bg-muted/50` with `hover:bg-background` so muted-foreground text never sits on a muted
   surface.

## Gates run (scoped self-checks; build and browser checks are the orchestrator's)

```
pnpm exec tsc -p apps/web/tsconfig.json --noEmit                                   -> exit 0
(apps/web) pnpm exec eslint src/app/layout.tsx src/app/error.tsx src/app/not-found.tsx "src/app/(catalog)"
  src/app/products src/components/shell src/components/ui/sheet.tsx src/components/ProductsTable.tsx
  src/components/SummaryTiles.tsx src/components/SearchForm.tsx src/components/Pagination.tsx  -> exit 0, no output
grep palette classes (bg|text|border|ring|fill|stroke|outline)-(red|...|white|black) over owned files -> none
grep literal colours (#hex, rgb(), hsl(), oklch()) over owned files                           -> none
grep text-muted-foreground together with bg-muted|accent|secondary on one element              -> none
grep text-primary together with bg-primary                                                     -> none
grep dangerouslySetInnerHTML | error.message | .stack | any                                    -> only the WHY comment in error.tsx
grep "<main" app components                                                                    -> app/layout.tsx only
```

## Decisions

- `PageHeader` and `TableRegion` live in `components/shell/` (the only new-component scope): they are page
  layout pieces shared by the catalog and product pages.
- Tables use the Table sub-primitives with a bare `<table>` inside `TableRegion` (`role="region"`,
  `aria-labelledby` = caption id, `tabIndex=0`, `overflow-x-auto`): the frozen `Table` wrapper is an unnamed,
  unfocusable scroll container, so keyboard users could not scroll it. Caption ids are fixed constants (one
  table per page) because `useId` is not needed in a Server Component.
- "Sticky-friendly": no table element uses z-index or its own vertical scroll, so the sticky top bar (z-40)
  always stays above content; the header row has an opaque-ish `bg-muted/50` with `text-foreground`.
  A sticky thead was not added because it would need a vertical scroll box inside the page.
- Drawer close on route change uses React's "adjust state while rendering" pattern instead of an effect
  (no set-state-in-effect lint, no frame with the drawer open on the new page).
- Overlay is `bg-background/70` + `backdrop-blur-xs`: a token scrim that works in both themes.
- Not-found and error pages add an `sr-only` `<h1>` because the frozen EmptyState/ErrorState titles are `<h2>`.
- `aria-current="true"` on Catalog for product pages: the section is current but the page is not.
- `exactOptionalPropertyTypes` is on, so optional props (`reference`, `onClick`) are spread only when defined.

## Out of scope / for the orchestrator

- Review pages (`app/reviews/**`, empty status tab, review loading) belong to ticket 12.
- Pagination now right-aligns with chevron icons; this also changes its look on `/reviews` (props, text and
  hrefs unchanged).
- `next build`, `web:lint`, browser checks not run here (shared `.next`).

Browser checks to run:
1. 1280px: sidebar visible, Catalog link `aria-current="page"` on `/`, "true" on `/products/1`; Review queue on `/reviews`.
2. 375px: sidebar hidden; "Open navigation" opens the drawer, focus moves inside, Tab cycles inside, Escape
   closes and focus returns to the trigger; clicking "Review queue" navigates and closes; back button with
   the drawer open closes it.
3. First Tab on any page shows "Skip to main content"; Enter moves focus to `#main-content`.
4. `/?q=zzzzqqq` shows the empty state with the query and "Clear search"; `/` tiles 976 / 255 / 2.
5. `/products/1` badges per match type in light and dark; a product without sellers shows the empty state.
6. `/products/abc` and `/products/999999` return 404 with the redesigned page; `/nope` returns 404.
7. API stopped: `/`, `/products/1` show "The catalog service is not reachable" with a reference and no stack;
   "Try again" re-renders after the API is back.
8. Both themes: no unreadable text; overlay and top bar look right in dark.
9. Horizontal scroll of the products and seller tables at 375px, and keyboard scroll after focusing the region.
