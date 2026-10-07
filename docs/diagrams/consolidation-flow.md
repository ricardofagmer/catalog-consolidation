# Consolidation flow

How one run, and one seller entry inside it, moves through the system. Drawn from the code in
`libs/consolidation/src/consolidation-run.ts` and
`libs/rules/src/matching.service.ts`, not from the plan. Edge counts are the first run
on the provided `data/ProductEntry.json` (269 entries) against the migrated `data/catalog.db`.

Related: [PRD](../prds/0001-catalog-consolidation.md) ·
[ADR 0002 identity and matching](../adr/0002-product-identity-normalized-name-and-brand.md) ·
[ADR 0004 review queue](../adr/0004-review-queue-for-uncertain-matches.md) ·
[ADR 0005 run semantics](../adr/0005-all-or-nothing-idempotent-runs.md)

## 1. One run

A run is all-or-nothing: the file is read and validated before the transaction opens, and any
database error rolls back every write of the run.

```mermaid
flowchart TD
    A["consolidate --db --input"] --> B{"Database exists and<br/>schema version = 3?"}
    B -- no --> X2["exit 2<br/>(missing or unmigrated DB)"]
    B -- yes --> C["Read and validate file<br/>JSON array, at most 10 MB and 100 000 entries"]
    C -- invalid file --> X2b["exit 2, nothing written"]
    C -- ok --> D["BEGIN transaction"]
    D --> E["Heal match keys<br/>products with NULL NormalizedName get keys<br/>from the normalizer"]
    E --> F["For each entry, in file order:<br/>decide outcome (diagram 2)"]
    F --> G{"--dry-run?"}
    G -- yes --> H["ROLLBACK<br/>committed=false"]
    G -- no --> I["COMMIT<br/>committed=true"]
    F -. "any database error" .-> R["ROLLBACK, exit 1"]
    H --> J["Write JSONL report (atomic rename)<br/>print summary, exit 0"]
    I --> J
```

Products created earlier in the same run are visible to later entries, because every entry is
processed inside the same transaction. Two sellers sending the same new product therefore give
one `CREATED` and one `LINKED_*`, not two products.

## 2. One entry

```mermaid
flowchart TD
    S["Seller entry"] --> V{"Record valid?<br/>required fields, lengths,<br/>Id charset"}
    V -- no --> RI["REJECTED_INVALID<br/>(0)"]
    V -- yes --> N{"normalize(Name)<br/>is empty?"}
    N -- yes --> RI2["REJECTED_INVALID<br/>unnormalizable:Name"]
    N -- no --> L{"Link exists for<br/>(SellerName, SellerProductId)?"}

    L -- yes --> LR{"Link MatchType<br/>= REVIEWED?"}
    LR -- yes --> U1["UNCHANGED<br/>human decision wins"]
    LR -- no --> RM{"Re-match gives the<br/>same product?"}
    RM -- yes --> U2["UNCHANGED<br/>(1)"]
    RM -- no --> CF["CONFLICT_SELLER_SKU<br/>nothing written (0)"]

    L -- no --> Q{"Review row exists for<br/>(SellerName, SellerProductId)?"}
    Q -- yes --> HR["HELD_FOR_REVIEW<br/>+ review_previously_rejected<br/>if the row was REJECTED"]
    Q -- no --> M["matchEntry<br/>(diagram 3)"]

    M -- "Link" --> DL{"Seller already linked to<br/>that product under another SKU?"}
    DL -- yes --> SK["SKIPPED_DUPLICATE_LISTING<br/>first SKU wins (11)"]
    DL -- no --> LK["Insert SellerProduct<br/>with raw Source* values"]
    LK --> LE["LINKED_EXACT (200)<br/>LINKED_NORMALIZED (54)"]

    M -- "Hold" --> HQ["Insert ProductMatchReview<br/>Status PENDING"]
    HQ --> HD["HELD_FOR_REVIEW (2)"]

    M -- "Create" --> CP["Insert Product with cleaned<br/>display values + match keys,<br/>then SellerProduct MatchType CREATED"]
    CP --> CR["CREATED (1)"]
```

The catalog row is never overwritten by a seller. When a seller's spelling differs from the
catalog, the difference lives on that seller's `SellerProduct` row (`SourceName`, `SourceBrand`,
`SourceCategory`), so every offer can be traced back to what the seller sent.

## 3. Matching one entry

Identity is the normalized name plus a compatible brand. Category is not part of identity
(one seller says "Photo", the catalog says "Photography"). Two brands are compatible when they
are equal after normalization or when either is NULL (unknown is not different).

```mermaid
flowchart TD
    Q["MatchQuery<br/>raw name, normalized name,<br/>normalized brand"] --> K["Products with the same NormalizedName<br/>and a compatible brand"]
    K --> C{"How many<br/>candidates?"}
    C -- 1 --> T{"Catalog Name equals<br/>the raw name?"}
    T -- yes --> E["Link EXACT"]
    T -- no --> NZ["Link NORMALIZED<br/>e.g. 'Câmera' to 'Camera',<br/>double spaces, Levi's to Levis"]
    C -- "more than 1" --> AM["Hold AMBIGUOUS<br/>never guess between products"]
    C -- 0 --> FZ["Fuzzy pass: difflib ratio over<br/>brand-compatible products,<br/>ties go to the lowest Id"]
    FZ --> TH{"Best ratio<br/>at least 0.80?"}
    TH -- yes --> HF["Hold FUZZY<br/>'Roteador WiFi 6 TP-Link' 0.909<br/>'Processador AMD Ryzen 9 7950X' 0.964"]
    TH -- "no, or no candidates" --> CR["Create<br/>'Security Test Product' best 0.476"]
```

Fuzzy similarity only ever holds an entry for review; it never links. A false merge attaches a
seller's offer to the wrong product, which is harder to detect and undo than a duplicate, so the
system takes the cost of a delayed offer instead.

## 4. Review queue lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: consolidate holds an entry<br/>(FUZZY or AMBIGUOUS)
    PENDING --> LINKED: review resolve --link PRODUCT_ID<br/>SellerProduct MatchType REVIEWED
    PENDING --> CREATED: review resolve --create<br/>new Product + SellerProduct CREATED
    PENDING --> REJECTED: review resolve --reject
    LINKED --> [*]: re-send reports UNCHANGED
    CREATED --> [*]: re-send reports UNCHANGED
    REJECTED --> [*]: re-send reports HELD_FOR_REVIEW<br/>+ review_previously_rejected
```

Only a `PENDING` row can be resolved; resolving any other row, linking to a missing product, or
linking a seller to a product it already offers exits 2 and writes nothing. A re-send while the
row is still `PENDING` reports `HELD_FOR_REVIEW` again without adding a second queue row.
