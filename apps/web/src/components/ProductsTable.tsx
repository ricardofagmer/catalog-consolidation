import Link from "next/link";
import type { ReactNode } from "react";
import type { ProductListItem } from "@catalog/api-client";
import { TableRegion } from "./shell/table-region";
import { TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

// Catalog text is shown exactly as stored, inner double spaces included.
const TEXT_CELL_CLASS_NAME = "whitespace-pre-wrap";
const MISSING_VALUE = "(none)";
// One products table per page, so a fixed id is unique.
const CAPTION_ID = "products-table-caption";
// The primitive's muted hover would put muted-foreground text on a muted surface; background
// keeps every text pair in the contrast-checked set (C-THEME).
const ROW_CLASS_NAME = "hover:bg-background";

export function ProductsTable({
  rows,
  caption,
}: {
  readonly rows: readonly ProductListItem[];
  readonly caption: string;
}): ReactNode {
  // The frozen Table primitive brings its own unnamed scroll wrapper; the bare <table> sits in a
  // named, focusable region instead.
  return (
    <TableRegion labelledBy={CAPTION_ID}>
      <table className="w-full caption-top border-collapse text-sm">
        <TableCaption id={CAPTION_ID} className="mb-0 border-b px-3 py-2.5 font-medium wrap-anywhere">
          {caption}
        </TableCaption>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-20">
              Id
            </TableHead>
            <TableHead scope="col">Name</TableHead>
            <TableHead scope="col">Brand</TableHead>
            <TableHead scope="col">Category</TableHead>
            <TableHead scope="col" className="text-right">
              Sellers
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={ROW_CLASS_NAME}>
              <TableCell className="font-mono text-muted-foreground tabular-nums">{row.id}</TableCell>
              <TableCell className={`${TEXT_CELL_CLASS_NAME} min-w-48`}>
                <Link
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={`/products/${String(row.id)}`}
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className={TEXT_CELL_CLASS_NAME}>{row.brand ?? <MissingValue />}</TableCell>
              <TableCell className={TEXT_CELL_CLASS_NAME}>{row.category ?? <MissingValue />}</TableCell>
              <TableCell className="text-right tabular-nums">{row.sellerCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </table>
    </TableRegion>
  );
}

function MissingValue(): ReactNode {
  return <span className="text-muted-foreground">{MISSING_VALUE}</span>;
}
