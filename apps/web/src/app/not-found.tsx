import { FileQuestionMark } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "../components/states/empty-state";
import { Button } from "../components/ui/button";

export default function NotFound(): ReactNode {
  // EmptyState titles are h2, so the page heading is supplied for screen-reader navigation.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={<FileQuestionMark />}
        title="Not found."
        description="This page does not exist. The address may be mistyped, or the page may have moved."
        action={
          <Button asChild variant="outline">
            <Link href="/">Back to the catalog</Link>
          </Button>
        }
      />
    </div>
  );
}
