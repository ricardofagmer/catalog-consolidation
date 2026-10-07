import { PackageSearch } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "../../components/states/empty-state";
import { Button } from "../../components/ui/button";

export default function ProductNotFound(): ReactNode {
  // EmptyState titles are h2, so the page heading is supplied for screen-reader navigation.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Product not found</h1>
      <EmptyState
        icon={<PackageSearch />}
        title="No product with this id."
        description="The link may be wrong, or the product id may not exist in the catalog. Search the catalog to find it."
        action={
          <Button asChild variant="outline">
            <Link href="/">Back to the catalog</Link>
          </Button>
        }
      />
    </div>
  );
}
