-- Match keys computed by the Python normalizer (one implementation of rule B). The runner
-- backfills every existing row inside the same transaction right after this script.
-- Not UNIQUE: two brands may legitimately share a generic product name.
ALTER TABLE Product ADD COLUMN NormalizedName TEXT;
ALTER TABLE Product ADD COLUMN NormalizedBrand TEXT;
CREATE INDEX IX_Product_NormalizedName ON Product (NormalizedName);
