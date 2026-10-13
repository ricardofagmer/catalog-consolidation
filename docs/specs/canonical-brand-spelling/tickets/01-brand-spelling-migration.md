# 01. Brand spelling migration and golden fixtures

**Status:** ready-for-agent
Blocked by: none
Closes checks: AC1, AC2, AC3, AC4, AC5 (proven by ticket 02)

Spec: [../../2026-10-13-canonical-brand-spelling.md](../../2026-10-13-canonical-brand-spelling.md)

## What to build

1. `migrations/0006_canonical_brand_spelling.sql` exactly as the spec's Contract section says, with
   a header comment (why, the user decision, the documented down path) in the style of
   `migrations/0005_seller_product_drop_source_columns.sql`.
2. Update every golden fixture under `fixtures/golden/` the migration changes, by hand, so it equals
   what the CLI will produce:
   - `table-product.json` in every scenario: `Brand` of Ids 458, 460 -> `simplehuman`, 607 -> `BLACK+DECKER`.
   - schema-version lines in `*.stdout` (5 -> 6) and any per-migration line the `migrate` command
     prints (read `apps/cli/src/commands/migrate.command.ts` for the exact format).
   - `schema-version.json` files: add the version 6 row with the file's sha256 checksum
     (`shasum -a 256`), in the same shape as the existing rows.
   - Find all of them with grep (`seller_product_drop_source_columns`, `schema version`, `Simplehuman`,
     `Black+Decker`); do not touch `product-normalized-keys.json` (keys are unchanged).
3. Any doc that states the current schema version or lists migrations (grep README.md and docs/)
   gets the new migration.

## Out of bounds

No change to `libs/rules`, consolidation, the API or `data/catalog.db`. No build, test or
`golden-check` runs (final-only, ticket 02). No git writes.
