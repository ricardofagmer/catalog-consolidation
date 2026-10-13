"use server";

import { revalidatePath } from "next/cache";
import { addSellerLinks, removeSellerLink, updateSellerLink, type SellerLinkOutcome } from "../../../lib/catalog-api";
import { parsePositiveInteger } from "../../../lib/search-params";
import { SELLER_LINK_ERROR_MESSAGES } from "../../../lib/seller-link-messages";
import { MAX_LINKS_PER_SUBMIT } from "./seller-link-fields";
import type { SellerLinkActionResult } from "./seller-link-result";

const GENERATED_SELLER_PRODUCT_ID_PREFIX = "P";

/**
 * Seller-link changes for one product page. The rules (uniqueness, trimming, the id charset) live
 * in the API; these actions only check the shape of the form, forward it and turn the API's
 * expected refusals into messages. Anything else (API down, timeout, busy database) throws to
 * error.tsx.
 */
export async function addSellerLinksAction(productId: number, formData: FormData): Promise<SellerLinkActionResult> {
  const links = readLinks(formData, productId);
  if (!isId(productId) || links === null) {
    return invalidRequest();
  }
  return finish(await addSellerLinks({ productId, links }));
}

export async function updateSellerLinkAction(
  productId: number,
  linkId: number,
  formData: FormData,
): Promise<SellerLinkActionResult> {
  const fields = readFields(formData);
  if (!isId(productId) || !isId(linkId) || fields === null) {
    return invalidRequest();
  }
  return finish(await updateSellerLink({ productId, linkId, request: fields }));
}

export async function removeSellerLinkAction(productId: number, linkId: number): Promise<SellerLinkActionResult> {
  if (!isId(productId) || !isId(linkId)) {
    return invalidRequest();
  }
  return finish(await removeSellerLink({ productId, linkId }));
}

// Bound arguments and form fields are untrusted: ids must be positive integers and each field
// must appear exactly once as a string.
function isId(value: number): boolean {
  return parsePositiveInteger(String(value)) !== null;
}

function readFields(formData: FormData): { readonly sellerName: string; readonly sellerProductId: string } | null {
  const sellerName = singleField(formData, "sellerName");
  const sellerProductId = singleField(formData, "sellerProductId");
  return sellerName === null || sellerProductId === null ? null : { sellerName, sellerProductId };
}

// The add form posts only the chosen seller names: the product is fixed by the page, and the schema
// still needs a seller product id, unique per seller, so one is derived from the catalog id (a seller
// can be linked to a product once). It stays editable from the links table.
function readLinks(
  formData: FormData,
  productId: number,
): readonly { readonly sellerName: string; readonly sellerProductId: string }[] | null {
  const names = formData.getAll("sellerName");
  if (names.length === 0 || names.length > MAX_LINKS_PER_SUBMIT) {
    return null;
  }
  const sellerProductId = `${GENERATED_SELLER_PRODUCT_ID_PREFIX}${String(productId)}`;
  const links: { readonly sellerName: string; readonly sellerProductId: string }[] = [];
  for (const sellerName of names) {
    if (typeof sellerName !== "string") {
      return null;
    }
    links.push({ sellerName, sellerProductId });
  }
  return links;
}

function singleField(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  const [value] = values;
  return values.length === 1 && typeof value === "string" ? value : null;
}

function invalidRequest(): SellerLinkActionResult {
  return { ok: false, message: SELLER_LINK_ERROR_MESSAGES.invalid_request };
}

function finish(outcome: SellerLinkOutcome): SellerLinkActionResult {
  if (outcome.kind === "rejected") {
    return { ok: false, message: SELLER_LINK_ERROR_MESSAGES[outcome.code] };
  }
  // The product page lists these links and the catalog list shows the seller names.
  revalidatePath("/");
  revalidatePath("/products/[id]", "page");
  return { ok: true };
}
