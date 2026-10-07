# 0004. Hold uncertain matches in a review queue instead of linking or creating

Date: 2026-10-05
Status: proposed

## Context

The matching rule in [0002](0002-product-identity-normalized-name-and-brand.md) produces two
uncertain outcomes: a fuzzy best ratio >= 0.80 with no exact-key candidate (on the real data,
`Roteador WiFi 6 TP-Link` at 0.91 and `Processador AMD Ryzen 9 7950X` at 0.96 against their
English catalog rows), and more than one exact-key candidate (an ambiguous name under a NULL
brand). Neither linking nor creating is safe: a wrong link attaches a seller to the wrong item,
a wrong create duplicates a product that then needs a merge. The brief says ambiguities are
intentional. Design record sections B, D and E freeze the behaviour.
Related: [PRD](../prds/0001-catalog-consolidation.md),
[0005 run semantics](0005-all-or-nothing-idempotent-runs.md).

## Options considered

1. **Auto-merge above the threshold.**
   - Pros: the 2 translations would link today and the seller's offer goes live immediately.
   - Cons: irreversible without manual cleanup across orders; 0.80 was chosen by looking at 269
     rows; a near-miss such as `Ryzen 9 7950X` vs `Ryzen 9 7900X` would score similarly high and
     be a different product.
2. **Create a new product and flag it.**
   - Pros: the offer is live; nothing is fused.
   - Cons: creates the duplicate the system exists to prevent; the flag is on a row that other
     sellers can now match to, so the duplicate spreads before anyone reviews it.
3. **Drop the entry and report it.**
   - Pros: no bad data enters the catalog.
   - Cons: the evidence (candidate, score, seller's raw values) lives only in a report file; the
     seller must re-send after a decision that nothing records.
4. **Review queue table, entry neither inserted nor linked** (chosen).
   - Pros: the decision is deferred to a human with the evidence attached; nothing irreversible
     happens; the queue is idempotent per seller SKU.
   - Cons: the seller's offer is not live until a human acts; the queue can grow unbounded if
     nobody works it; the threshold is tuned on 269 rows only and will need re-tuning; there is
     no resolution tool in this delivery.

## Decision

Option 4. Uncertain entries are written to `ProductMatchReview (Id, SellerName, SellerProductId,
SourceName, SourceBrand, SourceCategory, CandidateProductId NULL, Score REAL NULL, Reason IN
('FUZZY','AMBIGUOUS'), Status IN ('PENDING','LINKED','CREATED','REJECTED') DEFAULT 'PENDING',
CreatedAt, UNIQUE (SellerName, SellerProductId))` and reported as `HELD_FOR_REVIEW`. No
`Product` or `SellerProduct` row is touched. Re-sending the same entry while it is pending
reports `HELD_FOR_REVIEW` again without a second queue row; re-sending it after a reviewer set
the row to `REJECTED` also reports `HELD_FOR_REVIEW`, with the warning
`review_previously_rejected`, so a rejection is never silently overturned by a re-send. The
uniqueness key is the seller SKU, so the first queued `Reason` sticks even if a later catalog
change would classify the entry differently; accepted at this volume. A `--link` resolution
writes the `SellerProduct` row with `MatchType = 'REVIEWED'` (0003), and a later re-send of that
SKU reports `UNCHANGED` without re-matching: the automatic matcher never links fuzzy candidates,
so re-matching a human decision would report a false `CONFLICT_SELLER_SKU` on every run. Deciding reasons: the cost asymmetry
(false merge > duplicate > delay) makes "do nothing automatically" the only option with no
irreversible failure mode, and a queue row carries the evidence a reviewer needs where a report
line does not. Resolution (`review list` / `review resolve`) is an explicit stretch task; the
`Status` column exists so the schema does not change when it lands.

## Consequences

- Easier: zero automatic false merges by construction; the queue doubles as a dataset for
  tuning the threshold with real decisions behind it.
- Harder: 2 of 269 entries today produce no live offer; someone must own the queue; until the
  resolve command exists, a resolution is a hand-written SQL insert into `SellerProduct`.
- We commit to maintaining: the closed `Reason` and `Status` sets, the uniqueness per seller
  SKU, and reporting pending counts in every run summary so the queue cannot grow silently.
- Revisit when: pending rows exceed a working threshold for the team (for example 50 or older
  than 7 days); human decisions show the 0.80 cut is wrong in either direction (every rejected
  candidate above it, or every accepted one near it, is evidence to move it); or a resolved
  pattern recurs (the same translation pair accepted three times is a dictionary entry, not a
  review).
