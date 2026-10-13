import Link from "next/link";
import type { ReactNode } from "react";
import type { SellerLinkListItem } from "@catalog/api-client";
import { MatchTypeBadge } from "../../components/MatchTypeBadge";
import { TableRegion } from "../../components/shell/table-region";
import { TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

// Catalog and seller text is shown exactly as stored, inner double spaces included.
const TEXT_CELL_CLASS_NAME = "whitespace-pre-wrap";
const CAPTION_ID = "seller-link-list-caption";
// The primitive's muted hover would put muted-foreground text on a muted surface; background
// keeps every text pair in the contrast-checked set (C-THEME).
const ROW_CLASS_NAME = "hover:bg-background";

export function SellerLinkListTable({ rows }: { readonly rows: readonly SellerLinkListItem[] }): ReactNode {
  return (
    <TableRegion labelledBy={CAPTION_ID}>
      <table className="w-full caption-top border-collapse text-sm">
        <TableCaption id={CAPTION_ID} className="mb-0 border-b px-3 py-2.5 font-medium">
          Seller links
        </TableCaption>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-20">
              Link id
            </TableHead>
            <TableHead scope="col">Product</TableHead>
            <TableHead scope="col">Seller</TableHead>
            <TableHead scope="col">Seller SKU</TableHead>
            <TableHead scope="col">Match type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={ROW_CLASS_NAME}>
              <TableCell className="font-mono text-muted-foreground tabular-nums">{row.id}</TableCell>
              <TableCell className={`${TEXT_CELL_CLASS_NAME} min-w-48`}>
                <Link
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={`/products/${String(row.productId)}`}
                >
                  {row.productName}
                </Link>
              </TableCell>
              <TableCell className={TEXT_CELL_CLASS_NAME}>{row.sellerName}</TableCell>
              <TableCell className={`${TEXT_CELL_CLASS_NAME} font-mono`}>{row.sellerProductId}</TableCell>
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
