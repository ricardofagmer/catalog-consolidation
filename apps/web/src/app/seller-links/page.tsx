import { Link2Off } from "lucide-react";
import type { ReactNode } from "react";
import { Pagination } from "../../components/Pagination";
import { PageHeader } from "../../components/shell/page-header";
import { EmptyState } from "../../components/states/empty-state";
import { listSellerLinks } from "../../lib/catalog-api";
import {
  parseSellerLinkSearchParams,
  type RawSearchParams,
  type SellerLinkSearchParams,
} from "../../lib/search-params";
import { SellerLinkListTable } from "./seller-link-list-table";

// Links change under the page (consolidate runs, edits on product pages); nothing may be read at build time.
export const dynamic = "force-dynamic";

export default async function SellerLinksPage(props: {
  readonly searchParams: Promise<RawSearchParams>;
}): Promise<ReactNode> {
  const search = parseSellerLinkSearchParams(await props.searchParams);
  const page = await listSellerLinks({ afterId: search.afterId, limit: search.limit });
  const isFirstPage = search.afterId === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Seller links"
        description="Every seller offer linked to a catalog product, with how the link was made."
      />
      {page.items.length === 0 ? <EmptySellerLinks isFirstPage={isFirstPage} /> : <SellerLinkListTable rows={page.items} />}
      <Pagination
        basePath="/seller-links"
        params={paginationParams(search)}
        nextCursor={page.nextCursor}
        isFirstPage={isFirstPage}
      />
    </div>
  );
}

function EmptySellerLinks({ isFirstPage }: { readonly isFirstPage: boolean }): ReactNode {
  return isFirstPage ? (
    <EmptyState icon={<Link2Off />} title="No seller links yet" description="Run consolidate to load seller entries." />
  ) : (
    <EmptyState icon={<Link2Off />} title="No more seller links" description="You have reached the end of the list." />
  );
}

function paginationParams(search: SellerLinkSearchParams): Record<string, string> {
  return search.limit === null ? {} : { limit: String(search.limit) };
}
