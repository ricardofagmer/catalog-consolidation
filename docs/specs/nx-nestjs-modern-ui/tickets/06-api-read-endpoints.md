# 06: API read endpoints

**What to build:** The read side of the REST API on the shared provider libraries: catalog summary counts, product list with accent-insensitive name search and keyset paging, product detail with Seller Offers (capped at 100 with a "more" flag), and the review queue with live Candidates for ambiguous items. DTO classes carry validation and OpenAPI descriptions. Reads use read-only connections, one per operation.

**Blocked by:** 05

**Closes checks:** C10, C11, C12, C13, C14

**Status:** done

- [ ] `GET /v1/summary` on demo data returns 976 products, 255 Seller Offers and 2 pending reviews
- [ ] `GET /v1/products?q=camera` finds "Câmera Canon EOS R6"; default page 20, `limit=100` accepted, `limit=101` gives 400 `invalid_request`; the cursor yields a disjoint next page
- [ ] Product 976 returns 200 with the hostile brand intact as text; `abc` returns 400, `999999` returns 404 `product_not_found`; offers report `hasMore` only past 100
- [ ] `GET /v1/reviews?status=PENDING` returns reviews 1 and 2 with Candidates 21 and 28 and scores 0.9091 and 0.9643; an ambiguous item lists every live Candidate
- [ ] The dependency graph shows `api` and `cli` depending on the same rule libraries, and no rule implementation exists in an app

## Comments
