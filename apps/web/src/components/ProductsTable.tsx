import { ArrowDown, ArrowUp, ArrowUpDown, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ProductListItem, ProductSortField, SortOrder } from "@catalog/api-client";
import { catalogViewParams, type CatalogView } from "../lib/search-params";
import { cn } from "../lib/utils";
import { SellerNamesCell } from "./SellerNamesCell";
import { TableRegion } from "./shell/table-region";
import { TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

// Catalog text is shown exactly as stored, inner double spaces included.
const TEXT_CELL_CLASS_NAME = "whitespace-pre-wrap";
const MISSING_VALUE = "(none)";
// One products table per page, so fixed ids are unique; REGION_ID is the `/#products` target.
const CAPTION_ID = "products-table-caption";
const REGION_ID = "products";
// The primitive's muted hover would put muted-foreground text on a muted surface; background
// keeps every text pair in the contrast-checked set (C-THEME).
const ROW_CLASS_NAME = "hover:bg-background";
const SORT_LINK_CLASS_NAME = "inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:underline";

interface SortableColumn {
  readonly field: ProductSortField;
  readonly label: string;
  readonly className?: string;
}

const COLUMNS: readonly SortableColumn[] = [
  { field: "id", label: "Id", className: "w-20" },
  { field: "name", label: "Name" },
  { field: "brand", label: "Brand" },
  { field: "category", label: "Category" },
  { field: "sellers", label: "Sellers" },
  { field: "sellerCount", label: "Sellers #", className: "text-right" },
];

// Doubles as the aria-sort value and the spoken name of the order a header link switches to.
const SORT_ORDER_NAMES: Readonly<Record<SortOrder, "ascending" | "descending">> = {
  asc: "ascending",
  desc: "descending",
};
const SORT_ORDER_ICONS: Readonly<Record<SortOrder, LucideIcon>> = { asc: ArrowUp, desc: ArrowDown };

export function ProductsTable({
  rows,
  caption,
  view,
}: {
  readonly rows: readonly ProductListItem[];
  readonly caption: string;
  readonly view: CatalogView;
}): ReactNode {
  // The frozen Table primitive brings its own unnamed scroll wrapper; the bare <table> sits in a
  // named, focusable region instead.
  return (
    <TableRegion labelledBy={CAPTION_ID} id={REGION_ID}>
      <table className="w-full caption-top border-collapse text-sm">
        <TableCaption id={CAPTION_ID} className="mb-0 border-b px-3 py-2.5 font-medium wrap-anywhere">
          {caption}
        </TableCaption>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((column) => (
              <SortableHead key={column.field} column={column} view={view} />
            ))}
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
              <TableCell className={TEXT_CELL_CLASS_NAME}>
                <SellerNamesCell names={row.sellerNames} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.sellerNames.length}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </table>
    </TableRegion>
  );
}

// The active column flips its order; any other column starts ascending. A new order is a new list,
// so the link starts again at the first page.
function SortableHead({ column, view }: { readonly column: SortableColumn; readonly view: CatalogView }): ReactNode {
  const isActive = column.field === view.sort;
  const nextOrder: SortOrder = isActive && view.order === "asc" ? "desc" : "asc";
  const Icon = isActive ? SORT_ORDER_ICONS[view.order] : ArrowUpDown;
  return (
    <TableHead scope="col" className={column.className} aria-sort={isActive ? SORT_ORDER_NAMES[view.order] : undefined}>
      <Link className={SORT_LINK_CLASS_NAME} href={catalogHref({ ...view, sort: column.field, order: nextOrder })}>
        {column.label}
        <span className="sr-only">{`, sort ${SORT_ORDER_NAMES[nextOrder]}`}</span>
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} />
      </Link>
    </TableHead>
  );
}

function catalogHref(view: CatalogView): string {
  const query = new URLSearchParams(catalogViewParams(view)).toString();
  return query === "" ? "/" : `/?${query}`;
}

function MissingValue(): ReactNode {
  return <span className="text-muted-foreground">{MISSING_VALUE}</span>;
}
