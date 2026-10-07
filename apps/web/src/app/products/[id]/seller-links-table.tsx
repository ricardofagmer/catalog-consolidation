import type { ReactNode } from "react";
import type { SellerOffer } from "@catalog/api-client";
import { TableRegion } from "../../../components/shell/table-region";
import { TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { MatchTypeBadge } from "./match-type-badge";
import { MissingValue } from "./missing-value";

// Seller and catalog text is shown exactly as stored: an inner double space is the evidence of
// why a NORMALIZED match was needed, so HTML whitespace collapsing must not hide it.
const TEXT_CELL_CLASS_NAME = "whitespace-pre-wrap";
const CAPTION_ID = "seller-links-caption";
// The primitive's muted hover would put muted-foreground text on a muted surface; background
// keeps every text pair in the contrast-checked set (C-THEME).
const ROW_CLASS_NAME = "hover:bg-background";

export function SellerLinksTable({ rows }: { readonly rows: readonly SellerOffer[] }): ReactNode {
  return (
    <TableRegion labelledBy={CAPTION_ID}>
      <table className="w-full caption-top border-collapse text-sm">
        <TableCaption id={CAPTION_ID} className="mb-0 border-b px-3 py-2.5 font-medium">
          Seller links for this product
        </TableCaption>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">SellerName</TableHead>
            <TableHead scope="col">SellerProductId</TableHead>
            <TableHead scope="col">SourceName</TableHead>
            <TableHead scope="col">SourceBrand</TableHead>
            <TableHead scope="col">SourceCategory</TableHead>
            <TableHead scope="col">MatchType</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={ROW_CLASS_NAME}>
              <TableCell className={`${TEXT_CELL_CLASS_NAME} font-medium`}>{row.sellerName}</TableCell>
              <TableCell className={`${TEXT_CELL_CLASS_NAME} font-mono`}>{row.sellerProductId}</TableCell>
              <TableCell className={`${TEXT_CELL_CLASS_NAME} min-w-48`}>{row.sourceName}</TableCell>
              <TableCell className={TEXT_CELL_CLASS_NAME}>{row.sourceBrand ?? <MissingValue />}</TableCell>
              <TableCell className={TEXT_CELL_CLASS_NAME}>{row.sourceCategory ?? <MissingValue />}</TableCell>
              <TableCell>
                <MatchTypeBadge matchType={row.matchType} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </table>
    </TableRegion>
  );
}
