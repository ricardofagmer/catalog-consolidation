# 11: App shell and page states

**What to build:** A sidebar app shell (Catalog, Review queue) with a top bar holding the theme toggle, replaced by a drawer opened from a button below the small-screen breakpoint. The catalog page (totals, search, paging) and the product page (every Seller Offer, what each seller sent, Match Type) are redesigned inside it, and every page gains a loading state, a designed empty state (a search with no hits, an empty status tab) and a designed error state when the API is unreachable.

**Blocked by:** 10

**Closes checks:** C26, C28, C29

**Status:** done

- [ ] Desktop shows the sidebar and top bar; at the mobile preset the sidebar is a drawer that opens and closes
- [ ] Each route has a loading file, and an empty search and an empty tab show designed empty states
- [ ] With the API stopped each page shows the designed error state with no stack trace
- [ ] Catalog and product pages show the same data as before (976 products, offers per product) in both themes
- [ ] `next build`, lint and typecheck pass for `web`

## Comments
