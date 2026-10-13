"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { MultiSelectCombobox } from "../../../components/MultiSelectCombobox";
import { FOCUS_RING_CLASS_NAME } from "../../../components/reviews/focus-ring";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { addSellerLinksAction } from "./actions";
import { MAX_LINKS_PER_SUBMIT } from "./seller-link-fields";
import { useLinkAction } from "./use-link-action";

const COMBOBOX_ID = "add-sellers";
const ALREADY_LINKED_HINT = "already linked";

/**
 * Links several registered sellers to this product at once. The product is fixed by the page, so
 * only the sellers are chosen; the action derives each link's seller product id. The API adds every
 * link or none, and stores them as REVIEWED.
 */
export function AddSellerLinksForm({
  productId,
  sellerNames,
  linkedSellerNames,
}: {
  readonly productId: number;
  /** Every registered seller. */
  readonly sellerNames: readonly string[];
  /** Sellers this product already has a link for; a seller can be linked to a product once. */
  readonly linkedSellerNames: readonly string[];
}): ReactNode {
  const { pending, error, run } = useLinkAction();
  const [chosen, setChosen] = useState<readonly string[]>([]);

  const options = sellerNames.map((name) => ({
    value: name,
    disabled: linkedSellerNames.includes(name),
    hint: ALREADY_LINKED_HINT,
  }));

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run({
      work: () => addSellerLinksAction(productId, formData),
      // Cleared only on success, so a refused attempt can be corrected and resent.
      onSuccess: () => {
        setChosen([]);
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link sellers</CardTitle>
        <CardDescription>
          Choose one or more sellers to link to this product.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={COMBOBOX_ID}>Sellers</Label>
            <MultiSelectCombobox
              id={COMBOBOX_ID}
              options={options}
              value={chosen}
              onChange={setChosen}
              placeholder="Search and choose sellers…"
              noMatchText="No seller matches"
            />
          </div>
          {chosen.map((name) => (
            <input key={name} type="hidden" name="sellerName" value={name} />
          ))}
          <div>
            <Button
              type="submit"
              disabled={pending || chosen.length === 0 || chosen.length > MAX_LINKS_PER_SUBMIT}
              aria-busy={pending}
              className={FOCUS_RING_CLASS_NAME}
            >
              {pending ? (
                <>
                  <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus aria-hidden="true" />
                  {chosen.length > 1 ? `Add ${String(chosen.length)} links` : "Add link"}
                </>
              )}
            </Button>
          </div>
        </form>
        <div role="alert" aria-live="assertive" className="empty:hidden">
          {error === null ? null : <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
