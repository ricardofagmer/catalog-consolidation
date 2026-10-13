-- Sellers become first-class rows. SellerProduct is the N:N link between Seller and Product and
-- ProductMatchReview points at Seller too; both replace the SellerName text column with a
-- SellerId foreign key. SQLite cannot drop a column that is part of a UNIQUE constraint, so both
-- tables are rebuilt. Existing rows keep their Ids and every other column.
-- Safe with foreign_keys=ON: no table references SellerProduct or ProductMatchReview.
CREATE TABLE Seller (
  Id        INTEGER PRIMARY KEY AUTOINCREMENT,
  Name      TEXT NOT NULL CONSTRAINT UQ_Seller_Name UNIQUE,
  CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO Seller (Name)
SELECT SellerName FROM (
  SELECT SellerName FROM SellerProduct
  UNION
  SELECT SellerName FROM ProductMatchReview
)
ORDER BY SellerName;

CREATE TABLE SellerProduct_new (
  Id              INTEGER PRIMARY KEY AUTOINCREMENT,
  SellerId        INTEGER NOT NULL CONSTRAINT FK_SellerProduct_Seller REFERENCES Seller (Id),
  ProductId       INTEGER NOT NULL CONSTRAINT FK_Product_Id REFERENCES Product (Id),
  SellerProductId TEXT NOT NULL,
  SourceName      TEXT NOT NULL,
  SourceBrand     TEXT,
  SourceCategory  TEXT,
  MatchType       TEXT NOT NULL CHECK (MatchType IN ('EXACT', 'NORMALIZED', 'CREATED', 'REVIEWED')),
  CreatedAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UQ_SellerProduct_SellerSku UNIQUE (SellerId, SellerProductId),
  CONSTRAINT UQ_SellerProduct_SellerProduct UNIQUE (SellerId, ProductId)
);

INSERT INTO SellerProduct_new
  (Id, SellerId, ProductId, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType, CreatedAt)
SELECT sp.Id, s.Id, sp.ProductId, sp.SellerProductId, sp.SourceName, sp.SourceBrand,
       sp.SourceCategory, sp.MatchType, sp.CreatedAt
FROM SellerProduct AS sp
JOIN Seller AS s ON s.Name = sp.SellerName;

DROP TABLE SellerProduct;
ALTER TABLE SellerProduct_new RENAME TO SellerProduct;

CREATE INDEX IX_SellerProduct_ProductId ON SellerProduct (ProductId);

CREATE TABLE ProductMatchReview_new (
  Id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  SellerId           INTEGER NOT NULL CONSTRAINT FK_ProductMatchReview_Seller REFERENCES Seller (Id),
  SellerProductId    TEXT NOT NULL,
  SourceName         TEXT NOT NULL,
  SourceBrand        TEXT,
  SourceCategory     TEXT,
  CandidateProductId INTEGER CONSTRAINT FK_ProductMatchReview_Candidate REFERENCES Product (Id),
  Score              REAL,
  Reason             TEXT NOT NULL CHECK (Reason IN ('FUZZY', 'AMBIGUOUS')),
  Status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (Status IN ('PENDING', 'LINKED', 'CREATED', 'REJECTED')),
  CreatedAt          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UQ_ProductMatchReview_SellerSku UNIQUE (SellerId, SellerProductId)
);

INSERT INTO ProductMatchReview_new
  (Id, SellerId, SellerProductId, SourceName, SourceBrand, SourceCategory, CandidateProductId,
   Score, Reason, Status, CreatedAt)
SELECT r.Id, s.Id, r.SellerProductId, r.SourceName, r.SourceBrand, r.SourceCategory,
       r.CandidateProductId, r.Score, r.Reason, r.Status, r.CreatedAt
FROM ProductMatchReview AS r
JOIN Seller AS s ON s.Name = r.SellerName;

DROP TABLE ProductMatchReview;
ALTER TABLE ProductMatchReview_new RENAME TO ProductMatchReview;

CREATE INDEX IX_ProductMatchReview_Status ON ProductMatchReview (Status);
