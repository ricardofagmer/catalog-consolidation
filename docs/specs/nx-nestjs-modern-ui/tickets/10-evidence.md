# Ticket 10 evidence: design system and theme toggle

Date 2026-10-06. Worker: frontend-coordinator (IMPLEMENT, risk low, A2). Toolchain: Next.js 16.3.8
(Turbopack), React 19.3.0, Tailwind 4.3.3, next-themes 0.4.6, @fontsource-variable/inter 5.3.0.
Scratch: `out/theme-contrast/` (contrast script + table), `out/theme-smoke/` (DB copy, logs, served HTML/CSS).

## Files

- `apps/web/src/app/globals.css` (rewritten: tokens, `@theme inline`, base layer, reduced motion)
- `apps/web/src/app/layout.tsx` (Geist removed, Inter imported locally, ThemeProvider, ThemeToggle in header)
- `apps/web/src/lib/utils.ts` (new, `cn`)
- `apps/web/src/components/theme/{theme-provider,theme-toggle}.tsx` (new)
- `apps/web/src/components/ui/{button,card,badge,input,label,table,separator,skeleton,alert,dropdown-menu}.tsx` (new)
- Migrated: `Notice, Pagination, ProductsTable, ReviewCard, SearchForm, StatusTabs, SubmitButton, SummaryTiles` (props/exports unchanged)
- `postcss.config.mjs` unchanged (already `@tailwindcss/postcss`).

## Contract C-THEME rev1 (frozen for tickets 11 and 12)

Defined in `:root` (light) and `.dark`, mapped in `@theme inline` as `--color-<name>`, so
`bg-<name>`, `text-<name>`, `border-<name>`, `ring-<name>`, `outline-<name>` all work.

- Surfaces/text: `background foreground card card-foreground popover popover-foreground`
- Brand/neutral: `primary primary-foreground secondary secondary-foreground muted muted-foreground accent accent-foreground`
- Status: `destructive destructive-foreground success success-foreground warning warning-foreground`
  (each status colour is usable as TEXT on background/card and as a FILL under its `-foreground`)
- Lines/focus: `border input ring`
- Shell: `sidebar sidebar-foreground sidebar-primary sidebar-primary-foreground sidebar-accent sidebar-accent-foreground sidebar-border sidebar-ring`
- Radius: `--radius: 0.5rem` -> `rounded-sm|md|lg|xl` (radius-4px, -2px, radius, +4px)
- Shadows: `shadow-xs`, `shadow-sm` (subtle, `@theme`)
- Fonts: `font-sans` = "Inter Variable", system-ui stack; `font-mono` = system monospace stack
- Dark variant: `@custom-variant dark (&:is(.dark *))`; class set on `<html>` by next-themes, storage key `theme`
- Usage rules: muted/accent/secondary are SURFACES (`bg-muted`); secondary text is `text-muted-foreground`;
  links are `text-primary`; `muted`/`accent` must never be used as text colours.
- Primitives (`components/ui/`): Button (`variant` default|secondary|outline|ghost|destructive|link,
  `size` default|sm|lg|icon, `asChild`), `buttonVariants`, Card(+Header/Title/Description/Content/Footer),
  Badge (default|secondary|destructive|success|warning|outline, `asChild`), Input, Label, Table
  (+Header/Body/Row/Head/Cell/Caption; Table wraps an overflow-x container), Separator (`decorative`),
  Skeleton (aria-hidden, `motion-safe:animate-pulse`), Alert (default|success|warning|destructive, no
  default role: pass `role`/`aria-live`) + AlertTitle/AlertDescription, DropdownMenu (+Trigger, Content,
  Group, Label, Item, CheckboxItem, RadioGroup, RadioItem, Separator). `ThemeToggle(): ReactNode`, no props.
  No Sheet/drawer (ticket 11 owns it; `@radix-ui/react-dialog` is installed).

## Contrast (WCAG 2.x relative luminance; computed from globals.css by `node out/theme-contrast/contrast.mjs`, exit 0)

Text pairs need >= 4.5; `ring` and `input` are non-text (focus indicator, control boundary) at >= 3.

| Pair (fg on bg) | Min | Light fg / bg | Light | Dark fg / bg | Dark |
|---|---|---|---|---|---|
| foreground on background | 4.5 | #18181b / #fafafa | 16.97 | #fafafa / #09090b | 19.06 |
| foreground on card | 4.5 | #18181b / #ffffff | 17.72 | #fafafa / #141417 | 17.61 |
| card-foreground on card | 4.5 | #18181b / #ffffff | 17.72 | #fafafa / #141417 | 17.61 |
| popover-foreground on popover | 4.5 | #18181b / #ffffff | 17.72 | #fafafa / #18181b | 16.97 |
| muted-foreground on background | 4.5 | #52525b / #fafafa | 7.41 | #a1a1aa / #09090b | 7.76 |
| muted-foreground on card | 4.5 | #52525b / #ffffff | 7.73 | #a1a1aa / #141417 | 7.17 |
| muted-foreground on muted | 4.5 | #52525b / #f4f4f5 | 7.03 | #a1a1aa / #27272a | 5.81 |
| muted-foreground on popover | 4.5 | #52525b / #ffffff | 7.73 | #a1a1aa / #18181b | 6.91 |
| primary on background | 4.5 | #4f46e5 / #fafafa | 6.02 | #818cf8 / #09090b | 6.67 |
| primary on card | 4.5 | #4f46e5 / #ffffff | 6.29 | #818cf8 / #141417 | 6.16 |
| primary on accent | 4.5 | #4f46e5 / #eeeef1 | 5.43 | #818cf8 / #27272a | 4.99 |
| primary on muted | 4.5 | #4f46e5 / #f4f4f5 | 5.72 | #818cf8 / #27272a | 4.99 |
| primary-foreground on primary | 4.5 | #ffffff / #4f46e5 | 6.29 | #09090b / #818cf8 | 6.67 |
| secondary-foreground on secondary | 4.5 | #18181b / #f4f4f5 | 16.12 | #fafafa / #27272a | 14.27 |
| accent-foreground on accent | 4.5 | #18181b / #eeeef1 | 15.30 | #fafafa / #27272a | 14.27 |
| foreground on muted | 4.5 | #18181b / #f4f4f5 | 16.12 | #fafafa / #27272a | 14.27 |
| destructive on background | 4.5 | #b91c1c / #fafafa | 6.20 | #f87171 / #09090b | 7.19 |
| destructive on card | 4.5 | #b91c1c / #ffffff | 6.47 | #f87171 / #141417 | 6.65 |
| destructive on accent | 4.5 | #b91c1c / #eeeef1 | 5.59 | #f87171 / #27272a | 5.38 |
| destructive-foreground on destructive | 4.5 | #ffffff / #b91c1c | 6.47 | #09090b / #f87171 | 7.19 |
| success on background | 4.5 | #15803d / #fafafa | 4.81 | #4ade80 / #09090b | 11.42 |
| success on card | 4.5 | #15803d / #ffffff | 5.02 | #4ade80 / #141417 | 10.55 |
| success-foreground on success | 4.5 | #ffffff / #15803d | 5.02 | #09090b / #4ade80 | 11.42 |
| warning on background | 4.5 | #a16207 / #fafafa | 4.72 | #fbbf24 / #09090b | 11.92 |
| warning on card | 4.5 | #a16207 / #ffffff | 4.92 | #fbbf24 / #141417 | 11.01 |
| warning-foreground on warning | 4.5 | #ffffff / #a16207 | 4.92 | #09090b / #fbbf24 | 11.92 |
| sidebar-foreground on sidebar | 4.5 | #18181b / #f4f4f5 | 16.12 | #fafafa / #111113 | 18.07 |
| muted-foreground on sidebar | 4.5 | #52525b / #f4f4f5 | 7.03 | #a1a1aa / #111113 | 7.36 |
| sidebar-primary on sidebar | 4.5 | #4f46e5 / #f4f4f5 | 5.72 | #818cf8 / #111113 | 6.32 |
| sidebar-primary-foreground on sidebar-primary | 4.5 | #ffffff / #4f46e5 | 6.29 | #09090b / #818cf8 | 6.67 |
| sidebar-accent-foreground on sidebar-accent | 4.5 | #18181b / #e4e4e7 | 13.96 | #fafafa / #27272a | 14.27 |
| muted-foreground on sidebar-accent | 4.5 | #52525b / #e4e4e7 | 6.09 | #a1a1aa / #27272a | 5.81 |
| ring on background | 3 | #4f46e5 / #fafafa | 6.02 | #818cf8 / #09090b | 6.67 |
| ring on card | 3 | #4f46e5 / #ffffff | 6.29 | #818cf8 / #141417 | 6.16 |
| input on background | 3 | #8a8a93 / #fafafa | 3.28 | #6b6b74 / #09090b | 3.77 |
| input on card | 3 | #8a8a93 / #ffffff | 3.42 | #6b6b74 / #141417 | 3.48 |

tokens light=31 dark=31 failures=0

## Fonts: local only

- `grep -rn "next/font\|Geist" apps/web/src` -> no matches (exit 1).
- `grep -rlE "fonts\.googleapis\.com|fonts\.gstatic\.com" apps/web/.next` -> no matches (exit 1).
- Build emitted 7 woff2 files under `.next/static/media/inter-*-wght-normal.*.woff2` (latin, latin-ext, cyrillic,
  cyrillic-ext, greek, greek-ext, vietnamese; the browser fetches only the unicode-ranges it needs).
- Served CSS `/_next/static/chunks/176pi0qb458u-.css`: every `url()` is `../media/inter-*.woff2`; absolute hosts in
  CSS: none. Every woff2 fetched from `http://127.0.0.1:3000/_next/static/media/...` -> `200 font/woff2`
  (latin 48256 bytes). Absolute hosts in all served HTML: only `http://www.w3.org` (SVG `xmlns` of the lucide
  icons, not a request). 9 `@font-face` "Inter Variable" rules, `font-display: swap`.

## Gates run (scoped self-checks)

```
pnpm exec tsc -p apps/web/tsconfig.json --noEmit                    -> exit 0
NX_DAEMON=false pnpm exec nx run web:lint                           -> Successfully ran target lint for project web
env -u API_BASE_URL NX_DAEMON=false pnpm exec nx run web:build --skip-nx-cache
                                                                    -> Compiled successfully; routes / , /products/[id], /reviews (dynamic)
grep palette classes (bg|text|border|ring|fill|stroke)-(red|blue|...|white|black) over components + layout -> none
grep literal colours (#hex, rgb(), hsl(), oklch()) over components + layout                              -> none
```

## Runtime smoke (API 127.0.0.1:3071, web 127.0.0.1:3000)

DB: `out/theme-smoke/catalog.db` copy of `data/catalog.db`; on the copy `migrate` (0001-0003, schema 3) and
`consolidate --input data/ProductEntry.json` (LINKED_EXACT 200, LINKED_NORMALIZED 54, CREATED 1, HELD_FOR_REVIEW 2).
`GET /v1/summary` -> `{"products":976,"sellerOffers":255,"pendingReviews":2}`.

```
/                      200   tiles <dd ...>976</dd> <dd ...>255</dd> <dd ...>2</dd>
/?q=zzzzqqq            200
/products/1            200
/products/976          200
/reviews               200
/reviews?status=LINKED 200
/products/abc          404
/products/999999       404
```

Served HTML of `/`:
- `<html lang="en">` with no theme class server-side (correct: `suppressHydrationWarning` is a React-only prop
  and the class is set by the blocking script).
- next-themes inline `<script>` at offset 1154, `<header>` at 1698, `<main>` at 3226: the script is the first
  thing in `<body>`, ahead of all content, not async/deferred. Arguments:
  `("class","theme","system",null,["light","dark"],null,true,true)` = attribute class, storageKey theme,
  default system, enableSystem, enableColorScheme.
- Theme trigger: `<button ... aria-label="Theme" title="Theme" type="button" aria-haspopup="menu" aria-expanded="false">`.
Served CSS: `:root` carries all 31 colour tokens + `--radius` and `color-scheme: light`; `.dark` carries all 31
colour tokens and `color-scheme: dark`; `.dark` variant selectors and `@media (prefers-reduced-motion: reduce)` present.

Server stderr (`out/theme-smoke/web.err`): empty. stdout had one line
`warn: API at http://127.0.0.1:3071 is not ready; pages will show the error state until it is` (boot race: web
started in the same instant as the API; every later request returned data). No next-themes "script tag" message.

React "Encountered a script tag" analysis: in `react-dom/cjs/react-dom-client.development.js:13047` the warning
fires only in `createInstance` (a script element CREATED on the client, dev build). The provider lives in the
root layout, so its script is hydrated from the server HTML, never client-created; no workaround applied. It
could appear in `next dev` only if the root layout remounted on the client (for example a root-level error
recovery). Browser console confirmation is the orchestrator's interactive check.

Servers stopped by pid (next-server 94334, its pnpm parent 94329, API 94327); `lsof -iTCP:3000 -iTCP:3071
-sTCP:LISTEN` -> empty afterwards. Nothing else killed.

## Decisions

- Tokens are sRGB hex (not oklch) so the contrast maths is exact with no gamut mapping.
- Light background is soft `#fafafa` with white cards; dark background `#09090b` with `#141417` cards.
  One accent: indigo (`#4f46e5` light, `#818cf8` dark) as `primary`, `ring`, `sidebar-primary`.
- `input` is darker than `border` so control boundaries reach 3:1 (WCAG 1.4.11) while card borders stay thin.
- Inter imported in `layout.tsx` (`import "@fontsource-variable/inter"`) instead of a CSS `@import`, so Next's CSS
  pipeline rewrites the font `url()`s to hashed `/_next/static/media` assets.
- `ThemeToggle` always renders the same Radix trigger; until mounted (`useSyncExternalStore`, server snapshot
  false) the icon is the neutral SunMoon and no radio item is checked, so server and first client render match.
  `useSyncExternalStore` instead of `useEffect(setMounted)` avoids the react-hooks set-state-in-effect lint.
- Selected theme is announced through Radix `menuitemradio` + `aria-checked`; theme values from the menu are
  narrowed with a type guard before `setTheme`.
- `SubmitButton` stays a plain `<button>` (callers pass `buttonVariants(...)`) so its `className` prop contract
  is unchanged; `Notice` keeps `role="status" aria-live="polite"` on the Alert.
- Design-system primitives export their full shadcn surface (some parts have no caller yet) because tickets 11
  and 12 consume them in parallel.

## Known gap (outside this ticket's scope)

Page files still use the pre-ticket utilities `text-muted` and `text-accent`; under the shadcn contract those
are SURFACE colours, so that text is near invisible: muted on background 1.05 (light) / 1.34 (dark), accent on
background 1.11 / 1.34. Affected: `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/products/not-found.tsx`,
`src/app/products/[id]/page.tsx` (incl. MATCH_TYPE_CLASS_NAMES NORMALIZED/REVIEWED), `src/app/reviews/page.tsx`,
`src/app/(catalog)/page.tsx`. Mechanical fix: `text-muted` -> `text-muted-foreground`, `text-accent` -> `text-primary`
(`text-success` stays valid; `bg-border` skeletons stay valid). Owner: supervisor reroute (ticket 11/12 page owners).
