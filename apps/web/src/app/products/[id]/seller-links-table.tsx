import type { ReactNode } from "react";
import type { SellerOffer } from "@catalog/api-client";
import { TableRegion } from "../../../components/shell/table-region";
import { TableBody, TableCaption, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { SellerLinkRow } from "./seller-link-row";

const CAPTION_ID = "seller-links-caption";

export function SellerLinksTable({
  productId,
  rows,
  sellerNames,
}: {
  readonly productId: number;
  readonly rows: readonly SellerOffer[];
  readonly sellerNames: readonly string[];
}): ReactNode {
  const linkedSellerNames = rows.map((row) => row.sellerName);
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
            <TableHead scope="col">MatchType</TableHead>
            <TableHead scope="col" className="text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            // Keyed by the stored values: a saved edit changes the key, which remounts the row in
            // view mode instead of leaving it open on the old inputs.
            <SellerLinkRow
              key={`${String(row.id)}:${row.sellerName}:${row.sellerProductId}`}
              productId={productId}
              row={row}
              sellerNames={sellerNames}
              linkedSellerNames={linkedSellerNames}
            />
          ))}
        </TableBody>
      </table>
    </TableRegion>
  );
}
