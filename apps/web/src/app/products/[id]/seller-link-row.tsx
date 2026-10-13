"use client";

import { LoaderCircle, Pencil, Save, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { SellerOffer } from "@catalog/api-client";
import { FOCUS_RING_CLASS_NAME } from "../../../components/reviews/focus-ring";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { TableCell, TableRow } from "../../../components/ui/table";
import { cn } from "../../../lib/utils";
import { removeSellerLinkAction, updateSellerLinkAction } from "./actions";
import { MatchTypeBadge } from "../../../components/MatchTypeBadge";
import { SELLER_PRODUCT_ID_PATTERN, SELLER_FIELD_LIMITS } from "./seller-link-fields";
import { useLinkAction } from "./use-link-action";

// Seller text is shown exactly as stored, so HTML whitespace collapsing must not hide it.
const TEXT_CELL_CLASS_NAME = "whitespace-pre-wrap";
// The primitive's muted hover would put muted-foreground text on a muted surface; background
// keeps every text pair in the contrast-checked set (C-THEME).
const ROW_CLASS_NAME = "hover:bg-background";

// Matches the Input primitive, so the seller select sits level with the id input beside it.
const SELECT_CLASS_NAME =
  "h-9 w-full min-w-40 rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-xs disabled:opacity-60";

type Mode = "view" | "edit" | "confirm-delete";

/**
 * One seller link with its Edit and Delete controls. The parent keys it by the link's stored
 * values, so a saved edit remounts the row in view mode with the new values.
 */
export function SellerLinkRow({
  productId,
  row,
  sellerNames,
  linkedSellerNames,
}: {
  readonly productId: number;
  readonly row: SellerOffer;
  /** Every registered seller: the choices for this link's seller. */
  readonly sellerNames: readonly string[];
  /** Sellers this product is linked to; the link's own seller stays selectable. */
  readonly linkedSellerNames: readonly string[];
}): ReactNode {
  const [mode, setMode] = useState<Mode>("view");
  const save = useLinkAction();
  const remove = useLinkAction();
  const busy = save.pending || remove.pending;
  const formId = `edit-seller-link-${String(row.id)}`;

  function submitEdit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    save.run({
      work: () => updateSellerLinkAction(productId, row.id, formData),
      onSuccess: () => {
        setMode("view");
      },
    });
  }

  function confirmDelete(): void {
    // The row unmounts when the page re-renders without it.
    remove.run({ work: () => removeSellerLinkAction(productId, row.id) });
  }

  function cancel(): void {
    setMode("view");
  }

  const error = save.error ?? remove.error;

  return (
    <TableRow className={ROW_CLASS_NAME}>
      {mode === "edit" ? (
        <>
          <TableCell>
            <select
              form={formId}
              name="sellerName"
              aria-label={`Seller for link ${String(row.id)}`}
              defaultValue={row.sellerName}
              required
              className={cn(SELECT_CLASS_NAME, FOCUS_RING_CLASS_NAME)}
            >
              {sellerNames.map((name) => (
                <option key={name} value={name} disabled={name !== row.sellerName && linkedSellerNames.includes(name)}>
                  {name}
                </option>
              ))}
            </select>
          </TableCell>
          <TableCell>
            <Input
              form={formId}
              name="sellerProductId"
              aria-label={`Seller product id for link ${String(row.id)}`}
              defaultValue={row.sellerProductId}
              required
              maxLength={SELLER_FIELD_LIMITS.sellerProductId}
              pattern={SELLER_PRODUCT_ID_PATTERN}
              title="Letters, digits, dot, underscore and hyphen"
              autoComplete="off"
              className={cn("min-w-44 font-mono", FOCUS_RING_CLASS_NAME)}
            />
          </TableCell>
        </>
      ) : (
        <>
          <TableCell className={`${TEXT_CELL_CLASS_NAME} font-medium`}>{row.sellerName}</TableCell>
          <TableCell className={`${TEXT_CELL_CLASS_NAME} font-mono`}>{row.sellerProductId}</TableCell>
        </>
      )}
      <TableCell>
        <MatchTypeBadge matchType={row.matchType} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {mode === "view" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={FOCUS_RING_CLASS_NAME}
                aria-label={`Edit link of ${row.sellerName}`}
                onClick={() => {
                  setMode("edit");
                }}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("border-destructive/50 text-destructive hover:text-destructive", FOCUS_RING_CLASS_NAME)}
                aria-label={`Delete link of ${row.sellerName}`}
                onClick={() => {
                  setMode("confirm-delete");
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            </>
          ) : null}
          {mode === "edit" ? (
            <>
              <form id={formId} onSubmit={submitEdit} />
              <Button
                type="submit"
                form={formId}
                size="sm"
                disabled={busy}
                aria-busy={save.pending}
                className={FOCUS_RING_CLASS_NAME}
                aria-label={`Save link of ${row.sellerName}`}
              >
                {save.pending ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <Save aria-hidden="true" />}
                {save.pending ? "Saving…" : "Save"}
              </Button>
              <CancelButton onClick={cancel} disabled={busy} />
            </>
          ) : null}
          {mode === "confirm-delete" ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                aria-busy={remove.pending}
                className={FOCUS_RING_CLASS_NAME}
                aria-label={`Confirm delete of link of ${row.sellerName}`}
                onClick={confirmDelete}
              >
                {remove.pending ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : <Trash2 aria-hidden="true" />}
                {remove.pending ? "Deleting…" : "Confirm delete"}
              </Button>
              <CancelButton onClick={cancel} disabled={busy} />
            </>
          ) : null}
        </div>
        <div role="alert" aria-live="assertive" className="empty:hidden">
          {error === null ? null : <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      </TableCell>
    </TableRow>
  );
}

function CancelButton({ onClick, disabled }: { readonly onClick: () => void; readonly disabled: boolean }): ReactNode {
  return (
    <Button type="button" variant="ghost" size="sm" disabled={disabled} className={FOCUS_RING_CLASS_NAME} onClick={onClick}>
      <X aria-hidden="true" />
      Cancel
    </Button>
  );
}
