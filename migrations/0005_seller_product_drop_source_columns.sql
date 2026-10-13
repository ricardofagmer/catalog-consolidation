-- SellerProduct is a pure link (Seller x Product plus the seller's SKU and how it was matched).
-- The seller's raw name, brand and category duplicated Product and are dropped; for an offer
-- whose product was matched, the catalog row is the single source of those values.
-- ProductMatchReview keeps its Source columns: a pending entry has no product yet.
-- The table is rebuilt (SQLite cannot drop columns that other objects depend on safely here);
-- Ids and every remaining column are preserved. No table references SellerProduct.
CREATE TABLE SellerProduct_new (
  Id              INTEGER PRIMARY KEY AUTOINCREMENT,
  SellerId        INTEGER NOT NULL CONSTRAINT FK_SellerProduct_Seller REFERENCES Seller (Id),
  ProductId       INTEGER NOT NULL CONSTRAINT FK_Product_Id REFERENCES Product (Id),
  SellerProductId TEXT NOT NULL,
  MatchType       TEXT NOT NULL CHECK (MatchType IN ('EXACT', 'NORMALIZED', 'CREATED', 'REVIEWED')),
  CreatedAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UQ_SellerProduct_SellerSku UNIQUE (SellerId, SellerProductId),
  CONSTRAINT UQ_SellerProduct_SellerProduct UNIQUE (SellerId, ProductId)
);

INSERT INTO SellerProduct_new (Id, SellerId, ProductId, SellerProductId, MatchType, CreatedAt)
SELECT Id, SellerId, ProductId, SellerProductId, MatchType, CreatedAt FROM SellerProduct;

DROP TABLE SellerProduct;
ALTER TABLE SellerProduct_new RENAME TO SellerProduct;

CREATE INDEX IX_SellerProduct_ProductId ON SellerProduct (ProductId);
