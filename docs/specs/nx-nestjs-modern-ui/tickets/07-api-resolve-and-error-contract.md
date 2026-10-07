# 07: API resolve endpoint and error contract

**What to build:** `POST /v1/reviews/{id}/resolution` supports link-candidate, link-other, create and reject through the same `reviews` provider the CLI uses, taking the write lock up front. Every error the API can produce uses one shape (`statusCode`, `code`, `message`, `correlationId`) with a code from the closed set, and database busy or failure maps to 503 `database` logged by event and error type only. The OpenAPI document is complete for every endpoint and the error body.

**Blocked by:** 04, 06

**Closes checks:** C15, C16, C17, C22, C23

**Status:** done

- [ ] Resolving review 1 by link-candidate returns 200 with review id, final status, product id and link id, equals the CLI result on a twin copy, and a following `consolidate` reports the entry UNCHANGED with 0 rows written
- [ ] Posting the same resolution again returns 409 `review_not_pending` and adds no second link
- [ ] Every reachable error code (invalid request, unknown product and review, not pending, both link conflicts, unnormalizable name, missing candidate, unsupported media, bad host, database) returns exactly the four fields, a closed-set code and no stack trace, SQL or seller text
- [ ] With another process holding the write lock the endpoint returns 503 `database` after the busy timeout and the server logs exactly one structured event with no message or seller text
- [ ] `/docs-json` is valid OpenAPI covering every endpoint and the error body

## Comments
