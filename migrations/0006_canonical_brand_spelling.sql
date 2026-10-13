-- Two brands were written two ways in Product (same NormalizedBrand, different display Brand):
-- Simplehuman/simplehuman and Black+Decker/BLACK+DECKER. The user chose the brands' own
-- stylizations as the canonical display spelling (spec 2026-10-13-canonical-brand-spelling).
-- Only the display Brand changes: NormalizedName and NormalizedBrand already agree, so Product
-- Identity (ADR 0002) and every SellerProduct link are untouched.
-- Consolidation still stores the seller's spelling for products it creates later, so a variant
-- can reappear; that was accepted (no consolidation change).
-- Recovery (migrations are forward-only): restore the <db>.pre-migrate-<timestamp>.bak that
-- migrate writes before applying; the previous spelling is overwritten, so no generic inverse exists.
-- For the provided fixtures/source/catalog.db only, the changed rows can be restored by hand:
--   UPDATE Product SET Brand = 'Simplehuman' WHERE Id IN (458, 460);
--   UPDATE Product SET Brand = 'Black+Decker' WHERE Id = 607;
UPDATE Product SET Brand = 'simplehuman' WHERE NormalizedBrand = 'simplehuman' AND Brand <> 'simplehuman';
UPDATE Product SET Brand = 'BLACK+DECKER' WHERE NormalizedBrand = 'black decker' AND Brand <> 'BLACK+DECKER';
