import { ChevronRight, Store } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "../../../components/shell/page-header";
import { EmptyState } from "../../../components/states/empty-state";
import { Badge } from "../../../components/ui/badge";
import { listSellers } from "../../../lib/catalog-api";
import { AddSellerLinksForm } from "./add-seller-links-form";
import { findProduct } from "./find-product";
import { ProductFacts } from "./product-facts";
import { SellerLinksTable } from "./seller-links-table";

// Every request reads the live catalog through the API; nothing may be read at build time.
export const dynamic = "force-dynamic";

export default async function ProductPage(props: { readonly params: Promise<{ id: string }> }): Promise<ReactNode> {
  const { id } = await props.params;
  // The layout already answered 404 for a missing product; this repeats the cached lookup only to
  // narrow the type.
  const product = await findProduct(id);
  if (product === null) {
    notFound();
  }
  const sellerLinks = product.offers;
  const sellerNames = (await listSellers()).items.map((seller) => seller.name);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<span className="whitespace-pre-wrap">{product.name}</span>}
        description="The catalog row and every seller link that resolved to it."
      >
        <ProductBreadcrumb productId={product.id} />
      </PageHeader>
      <ProductFacts product={product} />
      <section aria-labelledby="sellers-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="sellers-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            Sellers
            <Badge variant="secondary" className="tabular-nums">
              {sellerLinks.items.length}
              {sellerLinks.hasMore ? "+" : ""}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            The sellers linked to this product, and how each link was made. Add, edit or delete a link here.
          </p>
        </div>
        <AddSellerLinksForm
          productId={product.id}
          sellerNames={sellerNames}
          linkedSellerNames={sellerLinks.items.map((link) => link.sellerName)}
        />
        {sellerLinks.items.length === 0 ? (
          <EmptyState icon={<Store />} title="No seller is linked to this product yet." />
        ) : (
          <SellerLinksTable productId={product.id} rows={sellerLinks.items} sellerNames={sellerNames} />
        )}
        {sellerLinks.hasMore ? <p className="text-sm text-muted-foreground">Showing the first 100 seller links.</p> : null}
      </section>
    </div>
  );
}

function ProductBreadcrumb({ productId }: { readonly productId: number }): ReactNode {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <li>
          <Link className="text-primary underline-offset-4 hover:underline" href="/">
            Catalog
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="size-3.5" />
        </li>
        <li>
          <span aria-current="page" className="font-mono">
            Product #{productId}
          </span>
        </li>
      </ol>
    </nav>
  );
}
