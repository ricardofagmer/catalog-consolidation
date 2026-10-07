-- SellerProductId becomes the seller's opaque TEXT SKU; adds traceability columns and the
-- idempotency keys. SQLite cannot change a column type in place, so the table is rebuilt.
-- SellerProduct is empty in the delivered catalog; any pre-existing row is preserved with
-- SourceName/SourceBrand/SourceCategory copied from its catalog product and MatchType 'EXACT'.
-- Safe with foreign_keys=ON: no table references SellerProduct.
CREATE TABLE SellerProduct_new (
  Id              INTEGER PRIMARY KEY AUTOINCREMENT,
  SellerName      TEXT NOT NULL,
  ProductId       INTEGER NOT NULL CONSTRAINT FK_Product_Id REFERENCES Product (Id),
  SellerProductId TEXT NOT NULL,
  SourceName      TEXT NOT NULL,
  SourceBrand     TEXT,
  SourceCategory  TEXT,
  MatchType       TEXT NOT NULL CHECK (MatchType IN ('EXACT', 'NORMALIZED', 'CREATED', 'REVIEWED')),
  CreatedAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UQ_SellerProduct_SellerSku UNIQUE (SellerName, SellerProductId),
  CONSTRAINT UQ_SellerProduct_SellerProduct UNIQUE (SellerName, ProductId)
);

INSERT INTO SellerProduct_new
  (Id, SellerName, ProductId, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType)
SELECT sp.Id, sp.SellerName, sp.ProductId, CAST(sp.SellerProductId AS TEXT),
       p.Name, p.Brand, p.Category, 'EXACT'
FROM SellerProduct AS sp
JOIN Product AS p ON p.Id = sp.ProductId;

DROP TABLE SellerProduct;
ALTER TABLE SellerProduct_new RENAME TO SellerProduct;

CREATE INDEX IX_SellerProduct_ProductId ON SellerProduct (ProductId);
