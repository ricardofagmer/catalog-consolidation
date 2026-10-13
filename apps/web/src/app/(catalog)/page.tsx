import { PackageOpen, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Pagination } from "../../components/Pagination";
import { ProductsTable } from "../../components/ProductsTable";
import { SearchForm } from "../../components/SearchForm";
import { PageHeader } from "../../components/shell/page-header";
import { SummaryTiles } from "../../components/SummaryTiles";
import { EmptyState } from "../../components/states/empty-state";
import { Button } from "../../components/ui/button";
import { getSummary, listProducts } from "../../lib/catalog-api";
import { catalogViewParams, parseCatalogSearchParams, type RawSearchParams } from "../../lib/search-params";

// Every request reads the live catalog through the API; nothing may be read at build time.
export const dynamic = "force-dynamic";

// A long query is shown whole, so it may wrap anywhere instead of overflowing the card.
const EMPTY_STATE_CLASS_NAME = "wrap-anywhere";

export default async function CatalogPage(props: {
  readonly searchParams: Promise<RawSearchParams>;
}): Promise<ReactNode> {
  const search = parseCatalogSearchParams(await props.searchParams);
  // Independent reads, so they go to the API concurrently.
  const [counts, page] = await Promise.all([
    getSummary(),
    listProducts({
      sort: search.sort,
      order: search.order,
      offset: search.offset,
      limit: search.limit,
      query: search.query,
    }),
  ]);
  const isFirstPage = search.offset === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catalog"
        description="Every consolidated product, with its brand, category and how many sellers are linked to it."
      />
      <SummaryTiles counts={counts} />
      <SearchForm query={search.query} />
      {page.items.length === 0 ? (
        <EmptyProducts query={search.query} isFirstPage={isFirstPage} />
      ) : (
        <ProductsTable rows={page.items} caption={tableCaption(search.query)} view={search} />
      )}
      <Pagination
        basePath="/"
        params={catalogViewParams(search)}
        cursorParam="offset"
        nextCursor={page.nextOffset}
        isFirstPage={isFirstPage}
      />
    </div>
  );
}

function EmptyProducts({
  query,
  isFirstPage,
}: {
  readonly query: string | null;
  readonly isFirstPage: boolean;
}): ReactNode {
  if (query !== null) {
    // The query is rendered as text, so React escapes it.
    return (
      <EmptyState
        className={EMPTY_STATE_CLASS_NAME}
        icon={<SearchX />}
        title="No products match your search"
        description={`Nothing in the catalog matches “${query}”. Check the spelling or try a shorter term.`}
        action={
          <Button asChild variant="outline">
            <Link href="/">Clear search</Link>
          </Button>
        }
      />
    );
  }
  if (isFirstPage) {
    return (
      <EmptyState
        icon={<PackageOpen />}
        title="The catalog is empty"
        description="Run consolidate to load seller entries."
      />
    );
  }
  return <EmptyState icon={<PackageOpen />} title="No more products" description="You have reached the end of the catalog." />;
}

function tableCaption(query: string | null): string {
  return query === null ? "Products" : `Products matching “${query}”`;
}
