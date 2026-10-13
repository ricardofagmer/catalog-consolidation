---
name: 2026-10-13-catalog-sorting-and-tile-lists
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-10-13-catalog-sorting-and-tile-lists.md
domain: frontend
---

## What
Server-side sortable catalog (default Name asc), a "Sellers #" column, clickable summary tiles and a
new `/seller-links` list page backed by `GET /v1/seller-links`.

## Why
User request 2026-10-13: order by name, sortable headers, quantity column if one exists, tiles that
open their lists.

## Scope
libs/persistence, apps/api/src/catalog, libs/api-client (schemas/index), apps/web/src.

## Checklist
- [x] T1 backend: sort/order/offset on products, seller-links list endpoint, client aliases (integrated, read-only diff review)
- [x] T2 web: sortable headers, Sellers # column, tile links, /seller-links page (integrated, read-only diff review)
- [ ] T3 final proof: skipped by user decision (validation pending)

## What was made
- API: GET /v1/products accepts sort (id|name|brand|category|sellers|sellerCount), order and offset;
  response adds nextOffset. New GET /v1/seller-links (keyset) with SellerLinkList DTOs.
- Persistence: allowlisted ORDER BY fragments (NULLs last, NOCASE text, Id tie-break), offset paging,
  listSellerLinkPage; api-client aliases for the new schemas.
- Web: catalog defaults to Name asc with sortable headers (aria-sort), "Sellers #" column, offset
  pagination, clickable summary tiles, new /seller-links page + nav entry, MatchTypeBadge moved to
  components, Search button removed (type-to-filter and Enter remain).
- Add-links form: per-seller SKU inputs removed; SKU derived as P<productId> in the server action.

## Verification
[validation] pending — final-stage user approval required (user skipped checks twice and chose to push without them)

## Human decisions
2026-10-13 | Ricardo Fagmer | scope | approved | dedicated pages for tiles; server-side sorting; Sellers sorts by first seller name; seller count instead of quantity (no quantity in data)
2026-10-13 | Ricardo Fagmer | final-validation | refused (skip for now) | codegen/typecheck/lint/build/golden-check not run
2026-10-13 | Ricardo Fagmer | scope | approved | add-links form: drop per-seller SKU inputs; SKU auto-generated as P<productId> (direct execution, 2 web files)
2026-10-13 | Ricardo Fagmer | scope | approved | removed Search button; Review queue nav + Pending reviews tile removed then rolled back (review queue must stay reachable)
2026-10-13 | Ricardo Fagmer | git | approved | commit everything (incl. modified data/catalog.db) and push to main without checks
2026-10-13 | Ricardo Fagmer | preview-declined | n/a | no throwaway prototype for spec r1 scope

## Changes registered
Committed to main together with the pre-existing uncommitted work in the tree (Seller table
migrations 0004/0005, seller-link add/edit/delete, golden fixtures, docs) and the consolidated
data/catalog.db, per user decision 2026-10-13. See the commit for the full file list.

## Notes
No quantity/stock field exists in the DB or the source feed.
A concurrent writer outside this change added GET /v1/sellers + multi-seller link form (08:30-08:33) in
overlapping files (catalog.controller/service/mapper, read model, api-client, catalog-api.ts); both
sets of edits coexist in the tree. Sellers sort uses BINARY collation on Seller.Name. Working-tree DB
has 255 seller links (spec said 257).
