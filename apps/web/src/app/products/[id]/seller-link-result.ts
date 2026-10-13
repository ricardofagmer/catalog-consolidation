/** What a seller-link server action tells its form; messages are written for the person, not the API. */
export type SellerLinkActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };
