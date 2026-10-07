-- Uncertain matches (fuzzy or ambiguous) wait here for a human; they are never auto-linked.
CREATE TABLE ProductMatchReview (
  Id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  SellerName         TEXT NOT NULL,
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
  CONSTRAINT UQ_ProductMatchReview_SellerSku UNIQUE (SellerName, SellerProductId)
);

CREATE INDEX IX_ProductMatchReview_Status ON ProductMatchReview (Status);
