import type { ReactNode } from "react";
import type { ProductDetail } from "@catalog/api-client";
import { Card, CardContent, CardDescription, CardHeader } from "../../../components/ui/card";
import { MissingValue } from "./missing-value";

export function ProductFacts({ product }: { readonly product: ProductDetail }): ReactNode {
  const facts: readonly (readonly [string, string | null])[] = [
    ["Name", product.name],
    ["Brand", product.brand],
    ["Category", product.category],
    ["NormalizedName", product.normalizedName],
    ["NormalizedBrand", product.normalizedBrand],
  ];
  return (
    <Card aria-labelledby="catalog-row-heading" role="region">
      <CardHeader>
        <h2 id="catalog-row-heading" className="font-semibold leading-none tracking-tight">
          Catalog row <span className="font-mono font-normal text-muted-foreground">#{product.id}</span>
        </h2>
        <CardDescription>The consolidated record every seller link points to.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-y-2">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              {/* Stored text is shown exactly: an inner double space explains a NORMALIZED match. */}
              <dd className="mb-2 whitespace-pre-wrap wrap-anywhere sm:mb-0">{value ?? <MissingValue />}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
