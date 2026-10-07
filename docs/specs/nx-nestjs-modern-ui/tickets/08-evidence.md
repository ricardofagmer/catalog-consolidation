# 08 evidence: generated api-client

Date: 2026-10-06. Worker: frontend-coordinator (IMPLEMENT, risk low, A2). No git repo, no git writes.
Toolchain: node v24.21.0, pnpm 12.8.1, Nx 23.2.1, TypeScript 6.0.3, openapi-typescript 7.13.0, openapi-fetch 0.17.0.

## Files

- `libs/api-client/src/client.ts`: `createApiClient({ baseUrl, fetch? }): ApiClient` (openapi-fetch `Client<paths>`); no retries; per-request `headers` go in each call's init.
- `libs/api-client/src/schemas.ts`: wire aliases derived by schema name from `components["schemas"]`.
- `libs/api-client/src/index.ts`: re-exports `paths`, `components`, `operations`, the client and the aliases.
- `nx.json` targetDefaults: new `generate`; `openapi` adjusted; `build`/`typecheck`/`lint` gain `generate` in `dependsOn` and one `dependentTasksOutputFiles` input (see Deviations).
- No project-level `eslint.config.mjs`: other libs have none and the root flat config lints `libs/api-client/src` (lint passed, below).

Aliases (generated schema name in parentheses): `Summary` (SummaryDto), `ProductPage` (ProductPageDto), `ProductListItem` (ProductListItemDto), `ProductDetail` (ProductDetailDto), `SellerOffer` (SellerOfferDto), `SellerOfferPage` (SellerOfferPageDto), `ReviewPage` (ReviewPageDto), `ReviewItem` (ReviewItemDto), `CandidateProduct` (CandidateProductDto), `ResolutionRequest` (ResolveReviewRequestDto), `ResolutionResponse` (ResolutionResponseDto), `ErrorBody` (ErrorBodyDto), `HealthStatus` (HealthStatusDto), and the unions `ApiErrorCode`, `ReviewStatus`, `ReviewReason`, `MatchType`, `ResolutionAction`, `ResolvedReviewStatus`.

## Resolved task graph (`nx show project api-client --json`, `nx show project api --json`)

```
generate  {"dependsOn":[{"projects":["api"],"target":"openapi"}],"inputs":["{projectRoot}/package.json",{"dependentTasksOutputFiles":"**/openapi.json"},{"externalDependencies":["openapi-typescript"]}],"outputs":["{projectRoot}/src/generated"],"cache":true}
build     {"dependsOn":["^build","generate"],"inputs":["production","^production",{"externalDependencies":["typescript"]},{"dependentTasksOutputFiles":"**/generated/**","transitive":true}],"outputs":["{projectRoot}/dist"],"cache":true}
typecheck {"dependsOn":["^build","generate"],"inputs":["default","^production",{"externalDependencies":["typescript"]},{"dependentTasksOutputFiles":"**/generated/**","transitive":true}],"outputs":[],"cache":true}
lint      {"dependsOn":["^build","generate"],"inputs":["default","lintConfig","^production","{workspaceRoot}/nx.json",{"dependentTasksOutputFiles":"**/generated/**","transitive":true}],"outputs":[],"cache":true}
api:openapi {"dependsOn":["^build","build"],"outputs":["{projectRoot}/dist/openapi.json"],"cache":false}
```

## Commands and output (real workspace)

`NX_DAEMON=false pnpm exec nx run api-client:generate`
```
✔ nx run domain:build ... ✔ nx run api:build
✔ nx run api:openapi
> nx run api-client:generate
$ openapi-typescript ../../apps/api/dist/openapi.json -o src/generated/schema.d.ts
openapi-typescript 7.13.0
../../apps/api/dist/openapi.json → src/generated/schema.d.ts [18.9ms]
NX Successfully ran target generate for project api-client and 7 tasks it depends on
```

`NX_DAEMON=false pnpm exec nx run-many -t build,typecheck,lint -p api-client --skip-nx-cache`
```
> nx run api:openapi
$ tsc -p tsconfig.json && node dist/openapi.js
wrote apps/api/dist/openapi.json
> nx run api-client:generate
> nx run api-client:typecheck   $ tsc -p tsconfig.json --noEmit
> nx run api-client:build       $ tsc -p tsconfig.json
> nx run api-client:lint        $ eslint src
NX Successfully ran targets build, typecheck, lint for project api-client and 8 tasks it depends on
```

Second identical run with cache (document unchanged):
```
> nx run api:openapi                                 (cache false: always rebuilds the document)
> nx run api-client:generate  [local cache]
> nx run api-client:lint  [existing outputs match the cache, left as is]
> nx run api-client:typecheck  [existing outputs match the cache, left as is]
> nx run api-client:build  [local cache]
Cache: 10/11 hit (91%)
```

Endpoints in the generated `paths` (`grep -nE '^    "/' src/generated/schema.d.ts`), 7 of 7:
```
/health/live  /health/ready  /v1/summary  /v1/products  /v1/products/{id}  /v1/reviews  /v1/reviews/{id}/resolution
```

`nx show projects`: `["consolidation","persistence","api-client","core","reviews","domain","rules","api","cli","web"]`.

`nx graph --file=graph.json`: `edges into api-client: []`, `edges from api-client: []`, tags `["npm:private","scope:client","type:lib"]`. The `generate -> api:openapi` link is a task dependency only and creates no project edge.

Other projects are unaffected by the shared `generate` dependency (they have no `generate` target):
`nx run-many -t typecheck,lint -p domain,rules,consolidation,persistence,reviews,api,cli` returned `Successfully ran targets typecheck, lint for 7 projects`.

`grep -rnE 'from "(@nestjs|class-validator|class-transformer|@catalog/)' libs/api-client/src`: no matches.

## Boundary (read, not edited: `eslint.module-boundaries.mjs`, C-TAGS rev1)

- `scope:web` may depend on `scope:web`, `scope:client` (+ temporary `legacy:web-visible`), so `web` may import `@catalog/api-client`.
- `scope:backend` may depend on `scope:backend` only, so `api`, `cli` and backend libs cannot import it.
- `scope:client` may depend on `scope:client` only, so the client cannot import backend code.

## DTO change propagates (scratch copy of the workspace, apps/api untouched)

Copy: `scratchpad/ws` (rsync without node_modules/.nx/data, root `node_modules` symlinked, `verifyDepsBeforeRun: false` added to the copy's pnpm-workspace.yaml only). A scratch consumer in the copy read `summary.pendingReviews`.

| Run | Change | generate | typecheck |
|---|---|---|---|
| 1 | baseline | runs | passes |
| 2 | none | `[local cache]` | cache hit, passes |
| 3 | `SummaryDto.pendingReviews` renamed `pendingReviewCount` in the copy | re-runs (schema line 173 becomes `pendingReviewCount: number;`) | re-runs, fails |
| 4 | consumer updated to the new name | `[local cache]` | re-runs, passes |
| 5 | DTO reverted | `[local cache]` (restores the original schema) | re-runs, fails: `TS2551: Property 'pendingReviewCount' does not exist on type '{ products: number; sellerOffers: number; pendingReviews: number; }'` |

The cache hits and misses follow the content of `openapi.json`. The generated schema is git-ignored, so the Nx file hasher does not see it; the `**/generated/**` dependent-output input supplies that hash. `transitive: true` carries it to `web:typecheck` (web -> ^build -> api-client:build -> api-client:generate) once ticket 09 adds the dependency.

## Defect found: the `.d.ts` generator output never reaches `dist`

`tsc` does not emit hand-placed `.d.ts` files, so `libs/api-client/dist/index.d.ts` references a missing `./generated/schema.js`. Because `skipLibCheck` is on, consumers silently get `any`:

```
probe.ts: import type { Summary } from "../libs/api-client/dist/index.js"; export const wrong: Summary = "not a summary";
tsc -p probe/tsconfig.json  ->  exit=0      (should fail)
```

Verified fix (scratch copy only): the `generate` script writes `src/generated/schema.ts` instead of `schema.d.ts`:
```
dist/generated/schema.d.ts and dist/generated/schema.js are emitted
probe.ts(2,14): error TS2322: Type 'string' is not assignable to type '{ products: number; sellerOffers: number; pendingReviews: number; }'.  exit=2
nx run-many -t build,typecheck,lint -p api-client --skip-nx-cache -> Successfully ran (lint passes on the generated .ts)
probe of all 7 endpoints plus per-request headers ({ Accept, x-correlation-id }) against dist -> exit=0
```
openapi-typescript does not delete old files. When switching over, remove the stale `src/generated/schema.d.ts` once: with both files present, lint fails with "schema.d.ts was not found by the project service". The source (`./generated/schema.js` imports) needs no change.

## Peer dependency

openapi-typescript 7.13.0 declares `typescript: ^5.x`. pnpm resolved it against 6.0.3 (`openapi-typescript@7.13.0_typescript@6.0.3`). Generation, compilation and strict type-checked lint of the output all work under 6.0.3. The peer range still needs watching on upgrades.
