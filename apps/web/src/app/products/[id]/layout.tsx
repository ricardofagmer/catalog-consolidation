import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { findProduct } from "./find-product";

// Every request reads the live catalog through the API; nothing may be read at build time.
export const dynamic = "force-dynamic";

// The existence check lives here, above this segment's loading.tsx: once a Suspense fallback has
// streamed, the 200 status is already sent and notFound() can no longer turn it into a 404.
export default async function ProductLayout(props: {
  readonly params: Promise<{ id: string }>;
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const { id } = await props.params;
  if ((await findProduct(id)) === null) {
    notFound();
  }
  return props.children;
}
