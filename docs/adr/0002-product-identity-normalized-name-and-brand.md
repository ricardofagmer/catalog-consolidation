# 0002. Define product identity as normalized name plus compatible brand

Date: 2026-10-05
Status: proposed

## Context

Seller entries carry `Name`, `Brand`, `Category` and a seller-scoped `Id`; the catalog carries
`Name`, `Brand`, `Category`. There is no shared external identifier (GTIN/EAN/UPC) on either side.
Profiling the 269 entries against the 975 products (2026-10-05) found the same product written
with: doubled internal whitespace (60 entries), diacritics (`Câmera Canon EOS R6` vs `Camera Canon
EOS R6`), inch marks (`Smart TV Samsung 55"` vs `Smart TV Samsung  55"`, `Tablet iPad Pro 12.9''`),
an apostrophe in the brand (`Levi's` vs catalog `Levis`), brand case (`Black+Decker` vs
`BLACK+DECKER`, both spellings exist inside the catalog itself), a category synonym (`Photo` vs
`Photography`) and Portuguese translations (`Roteador WiFi 6 TP-Link` vs `Router WiFi 6 TP-Link`).
Brand is NULL on 119 catalog rows and 3 entries. Design record section B freezes the rule.
Related: [PRD](../prds/0001-catalog-consolidation.md),
[0004 review queue](0004-review-queue-for-uncertain-matches.md).

## Options considered

1. **Raw exact match on all columns** (`Name`, `Brand`, `Category` equal).
   - Pros: trivially explainable; impossible to merge two different products.
   - Cons: on real data only 200 of 269 entries match; the other 54 same-product entries
     (whitespace, accents, quotes, case) would become duplicates; `Photo` vs `Photography`
     alone creates a duplicate of a product the seller sent twice.
2. **Name-only match** (normalized name, brand ignored).
   - Pros: catches every variant above with one key.
   - Cons: a generic name (`Jeans Straight Fit`, `Belt Leather Reversible`) legitimately
     exists under several brands in a marketplace; name-only would fuse them. The current
     catalog has no such collision, which says nothing about the next seller file.
3. **Fuzzy auto-merge above a similarity threshold** (e.g. `difflib` ratio >= 0.80 links).
   - Pros: would also link the two translations (`Roteador` 0.91, `Processador` 0.96).
   - Cons: a false merge attaches a seller to the wrong item and a customer receives the wrong
     product; it is silent and must be undone by hand across orders. A threshold tuned on 269
     rows is not evidence it is safe on the next 269.
4. **External identifier (GTIN/EAN) as the key.**
   - Pros: the industry answer; exact, brand-independent, language-independent.
   - Cons: absent from both the catalog and the seller file today, so it cannot decide
     anything in this challenge.
5. **Normalized name + compatible brand, exact-key first, fuzzy only to propose** (chosen).
   - Pros: catches all 54 formatting variants deterministically; brand keeps generic names
     apart; every automatic link is explainable by a rule a human can apply by hand.
   - Cons: translations and synonyms are never linked automatically; the normalizer is lossy
     and hand-maintained; the fuzzy pass is O(catalog) per unmatched entry.

## Decision

Option 5. Identity is `(NormalizedName, Brand)` where `normalize` is, in order: Unicode NFKD and
drop combining marks (`Câmera` -> `Camera`); `casefold()`; delete the quote characters
`" ' ’ “ ”` (`Levi's` -> `levis`, `55"` -> `55`, `12.9''` -> `12.9`); replace every remaining
non-`[0-9a-z]` run with one space (`BLACK+DECKER` -> `black decker`, `12.9` -> `12 9`); collapse
whitespace and trim; empty -> NULL. Brands are compatible when normalized-equal or when either
side is NULL (unknown is not "different"). Category is excluded from identity because sellers use
their own taxonomy. Matching is deterministic: exactly one candidate on the exact key links
(`EXACT` if the raw name is equal, else `NORMALIZED`); more than one candidate holds for review;
zero candidates triggers a `difflib.SequenceMatcher` pass over brand-compatible products, and a
best ratio >= 0.80 holds for review while anything lower creates a new product. Fuzzy never links.
Deciding reasons: the cost is asymmetric (a false merge is costlier and harder to undo than a
duplicate), and every merge the system performs must be explainable by a rule a human can apply
by hand. On the real data: 200 `LINKED_EXACT`, 54 `LINKED_NORMALIZED`, 2 `HELD_FOR_REVIEW`
(0.91, 0.96), 1 `CREATED` (`Security Test Product`, best ratio 0.48 among brand-compatible rows).

## Consequences

- Easier: every link is reproducible from the two stored normalized columns; the same function
  backfills the catalog and processes entries; `12.9''` and `12.9` collide on purpose.
- Harder: translations and true synonyms are never linked automatically (2 of 269 wait for a
  human); the normalizer is lossy (`12.9` and `129` stay distinct, but `C++` and `C` do not);
  a NULL-brand entry matching two brands of the same name is held, not linked.
- We commit to maintaining: the normalizer as the single source of the rule, a golden set of
  the variants listed in Context, and the 0.80 threshold as a named constant with its evidence.
- Revisit when: a GTIN/EAN field appears on either side (it becomes the primary key, this rule
  the fallback); the review queue shows a repeated class of near-misses (a translation
  dictionary or a token-based score would then be justified by data); or a false merge is ever
  reported (tighten the key before loosening anything).
