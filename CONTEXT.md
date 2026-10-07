# Catalog Consolidation

A marketplace that receives product files from many sellers and merges them into one catalog without
duplicating products, while recording which sellers offer each product.

## Language

**Catalog Product**:
A product in the marketplace's own catalog. Sellers never overwrite it.
_Avoid_: Item, SKU, listing

**Seller**:
A store that offers products on the marketplace, identified by its name.
_Avoid_: Vendor, merchant, store

**Seller Entry**:
One product record inside a Seller File, exactly as the seller sent it.
_Avoid_: Row, line item

**Seller File**:
A JSON file of Seller Entries received from sellers.
_Avoid_: Feed, import file

**Seller SKU**:
The seller's own opaque identifier for one of its products. Unique only within one Seller.
_Avoid_: Product id, external id

**Seller Offer**:
The link recording that a Seller offers a Catalog Product, together with the name, brand and category the seller used.
_Avoid_: Listing, seller product, mapping

**Consolidation**:
Processing a Seller File so every Seller Entry ends in exactly one Outcome, linking to existing Catalog Products instead of duplicating them.
_Avoid_: Import, sync, ingestion

**Product Identity**:
Two products are the same when their Normalized Names are equal and their brands are compatible. Category is not part of identity.
_Avoid_: Duplicate key, match key

**Normalized Name**:
A product name reduced to lowercase letters and digits separated by single spaces, ignoring accents, quotes and spacing differences.
_Avoid_: Slug, clean name

**Compatible Brand**:
Two brands are compatible when they are equal after normalization or when either is unknown.
_Avoid_: Same brand

**Match Type**:
How a Seller Offer was established: Exact (identical name), Normalized (equal after normalization), Created (new Catalog Product), or Reviewed (confirmed by a person).
_Avoid_: Link kind

**Outcome**:
The result of processing one Seller Entry: Linked Exact, Linked Normalized, Created, Unchanged, Skipped Duplicate Listing, Held For Review, Rejected Invalid or Conflict Seller SKU.
_Avoid_: Status, result code

**Review Item**:
A Seller Entry that resembles an existing Catalog Product too closely to create and too loosely to link, held for a person to decide.
_Avoid_: Ticket, flagged entry

**Candidate**:
The Catalog Product a Review Item resembles, with a similarity score.
_Avoid_: Suggestion, match

**Resolution**:
A person's decision on a Review Item: link it to a product, create a new Catalog Product, or reject it.
_Avoid_: Approval, triage
