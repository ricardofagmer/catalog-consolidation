# Ticket 02 evidence: Nx workspace and boundaries

Status: OK. Captured 2026-10-06 on node v24.21.0, pnpm 12.8.1, TypeScript 6.0.3. Nx 23.2.1 runs
`build`, `lint` and `typecheck` for `core`, `cli` and `web`; a second identical run is 9/9 cache
hits. The boundary rule fails a forbidden web import and passes the real tree. `affected` with
`--files` selects the changed project and its dependents only. The golden check still passes
22/22, and both data files are byte-identical. Raw logs are in `out/ticket02/` (scratch, not
versioned).

C1 is only partly closed here. Its nine-project list (api, domain, rules, ...) depends on tickets
03 and later. This ticket shows the C1 mechanism on the three projects that exist today.

## Decisions

- **Inference: Nx core's package.json-script inference, with no task plugin.** Nx reads each
  project's own `package.json` scripts (`tsc -p tsconfig.json`, `eslint src`/`eslint .`,
  `next build`, `tsc --noEmit`). `nx.json` `targetDefaults` adds cache, inputs, outputs and
  `dependsOn`. I added neither `@nx/js`, `@nx/eslint` nor `@nx/next` as plugins:
  - the scripts already are the tool commands, so the plan's fallback (hand-written
    `project.json` targets) was not needed;
  - a second, plugin-inferred `lint`/`build` target would shadow the script targets and add
    dependencies for no gain.
- **Packages added (root devDependencies, exact pins, verified with `pnpm view` 2026-10-06):**
  `nx@23.2.1` and `@nx/eslint-plugin@23.2.1` (the boundary rule). Lockfile supply-chain policy
  passed. The `nx` postinstall only updates the Nx Cloud client. It is denied in
  `pnpm-workspace.yaml` (`allowBuilds: nx: false`) and `nx.json` sets `neverConnectToCloud`.
- **Project names and tags** live in each `package.json` `"nx"` field:
  - `core` (`@catalog/core`): `scope:backend`, `type:lib`, `legacy:web-visible`
  - `cli` (`@catalog/cli`): `scope:backend`, `type:app`
  - `web` (`@catalog/web`): `scope:web`, `type:app`
- **Boundary rule (tag contract revision 1).** One shared file, `eslint.module-boundaries.mjs`,
  is imported by the root config (ESLint 10.12.0) and by `apps/web/eslint.config.mjs` (ESLint
  9.39.5, still pinned by web). Constraints:
  - `scope:backend` -> `scope:backend`
  - `scope:web` -> `scope:web`, `scope:client`, `legacy:web-visible` (temporary; a comment names
    ticket 09 as the removal point)
  - `scope:client` -> `scope:client`
  - `type:app` -> `type:lib`
  - `type:lib` -> `type:lib`

  The two `type:` constraints only add strictness: apps and libs may never import an app.
  Tool config files (`*.config.*`) are excluded from the rule. `apps/web/eslint.config.mjs` has
  to import the shared file by relative path, and the rule otherwise reports that import (first
  attempt, `web:lint` failed on `eslint.config.mjs:5`).
- **Cache.** `build`, `lint` and `typecheck` are cached.
  - Named inputs: `sharedGlobals` (`tsconfig.base.json`, `pnpm-workspace.yaml`, `.nvmrc`),
    `lintConfig` (root, shared and project ESLint configs) and `production`.
  - Outputs: `{projectRoot}/dist` by default. `web:build` uses `.next/**`, excludes
    `.next/cache/**`, and also covers `next-env.d.ts`.
  - `.nxignore` excludes `out/`, `fixtures/`, `data/`, `.engineos/`, `.specs/`, `docs/`,
    `.superpowers/`, `.claude/`, `.venv/` and `.ruff_cache/`. `.nx/` was added to `.gitignore`.
  - `dev`/`start` are `continuous` and uncached.
- **Dependencies between tasks.** Every task uses `dependsOn: ["^build"]`, because `cli` and
  `web` resolve `@catalog/core` types from `packages/core/dist`. `web:typecheck` also depends on
  `web:build`: `apps/web/tsconfig.json` includes `.next/types/**` and `next-env.d.ts`, which
  `next build` generates. Running the two in parallel would race on those files.
- **Root scripts.** `build`, `lint` and `typecheck` now run `nx run-many -t <target>`. `cli`,
  `parity` and `dev` are unchanged and still meaningful. `dev` stays on pnpm's
  `--parallel --filter` because it starts long-running watchers.
- `pnpm-workspace.yaml` globs now include `libs/*`. No lib was created.

## C1: projects, targets and cache (`NX_TUI=false NX_DAEMON=false`)

```
$ nx show projects
["core","cli","web"]

$ nx reset && nx run-many -t build,lint,typecheck --output-style=static   # exit 0
> nx run core:typecheck
> nx run core:build
> nx run cli:build
> nx run core:lint
> nx run cli:typecheck
> nx run cli:lint
> nx run web:build
> nx run web:lint
> nx run web:typecheck
 NX   Successfully ran targets build, lint, typecheck for 3 projects
  Cache:             0/9 hit (0%)

$ nx run-many -t build,lint,typecheck --output-style=static               # exit 0, identical rerun
> nx run core:build  [local cache]
> nx run core:lint  [existing outputs match the cache, left as is]
> nx run core:typecheck  [existing outputs match the cache, left as is]
> nx run web:build  [local cache]
> nx run web:lint  [existing outputs match the cache, left as is]
> nx run cli:lint  [existing outputs match the cache, left as is]
> nx run cli:build  [local cache]
> nx run cli:typecheck  [existing outputs match the cache, left as is]
> nx run web:typecheck  [existing outputs match the cache, left as is]
 NX   Successfully ran targets build, lint, typecheck for 3 projects
Nx read the output from the cache instead of running the command for 9 out of 9 tasks.
  Cache:             9/9 hit (100%)
```

Adding `.nx/` to `.gitignore` after these runs invalidated every hash, because Nx hashes
`.gitignore`. On the final tree, a fresh run exited 0 (0/9 hit) and the identical rerun exited 0
with `Cache: 9/9 hit (100%)` (`out/ticket02/run4.log`).

The root scripts run through Nx: `pnpm run build` exit 0 (3/3 hit), `pnpm run lint` exit 0 (4/4
hit), `pnpm run typecheck` exit 0 (5/5 hit). `pnpm cli --help` still prints the CLI usage.

Versions after install: ESLint root 10.12.0, `apps/web` ESLint 9.39.5, TypeScript 6.0.3, Nx v23.2.1
(local).

## C2: boundary rule

The first probe imported the `cli` app. It was not reported, because `@catalog/cli` has no `main`
or `exports`. Neither Node nor Nx can resolve it to a project, so that import is not a real
dependency edge.

The evidence probe used a throwaway `scope:backend`/`type:lib` package, created in the fresh
directory `libs/boundary-probe/` (`libs/` did not exist before). It had `main: index.js` and
`nx.tags`. The probe `apps/web/src/__boundary_probe.ts` contained
`import { probe } from "@catalog/boundary-probe";`.

```
$ nx show projects
["boundary-probe","core","cli","web"]

$ nx lint web --output-style=static                                        # exit 1
$ eslint .
apps/web/src/__boundary_probe.ts
  2:1  error  A project tagged with "scope:web" can only depend on libs tagged with "scope:web", "scope:client", "legacy:web-visible"  @nx/enforce-module-boundaries
✖ 1 problem (1 error, 0 warnings)
Failed tasks:
- web:lint
```

Cleanup: I deleted the probe file and both scratch files one by one, then ran `rmdir` on
`libs/boundary-probe` and `libs`. `pnpm-lock.yaml` never gained a `boundary` entry (count 0).

```
$ ls -d libs apps/web/src/__boundary_probe.ts
ls: apps/web/src/__boundary_probe.ts: No such file or directory
ls: libs: No such file or directory

$ nx show projects
["core","cli","web"]

$ nx lint web --output-style=static                                        # exit 0 (cache hit, same hash as the pre-probe tree)
$ nx lint web --skip-nx-cache --output-style=static                        # exit 0 (eslint actually re-ran)
```

`eslint --print-config` shows the rule active at severity 2 with the depConstraints above. It was
checked for `apps/cli/src/main.ts` (root config, ESLint 10) and `apps/web/src/app/page.tsx` (web
config, ESLint 9).

## C3: affected without git (`--files` form)

The workspace has no git repository, so `nx affected` against a base ref is not used. The
documented form is `nx show projects --affected --files=<path>`.

```
$ nx show projects --affected --files=packages/core/src/index.ts
["core","cli","web"]
$ nx show projects --affected --files=apps/web/src/proxy.ts
["web"]
$ nx show projects --affected --files=apps/cli/src/main.ts
["cli"]
$ nx show projects --affected --files=docs/specs/nx-nestjs-modern-ui/tickets/02-nx-workspace-and-boundaries.md
[]
```

## Golden check (ticket 01 fixture check)

The cli was built through Nx (`nx build cli`: `core:build` and `cli:build` restored from the
local cache). Then:

```
$ scripts/golden-check.sh                                                  # exit 0
golden: OK help-review-resolve
golden: OK help-never-runs
golden: OK (22/22 scenarios)
```

## Data integrity

```
before:
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
after:
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
(diff: identical)
```

## Files changed

- Created: `nx.json`, `.nxignore`, `eslint.module-boundaries.mjs`, this file.
- Edited: `package.json` (root scripts, devDependencies `nx`, `@nx/eslint-plugin`),
  `pnpm-workspace.yaml` (`libs/*`, `allowBuilds.nx: false`), `pnpm-lock.yaml` (install),
  `eslint.config.mjs`, `apps/web/eslint.config.mjs`, `.gitignore` (`.nx/`),
  `packages/core/package.json`, `apps/cli/package.json` and `apps/web/package.json` (`"nx"`
  field only).
- No source under `packages/core/src`, `apps/cli/src`, `apps/web/src`, `scripts/`, `fixtures/`,
  `data/` or `migrations/` was changed. The temporary probe was created and removed, as described
  under C2.

## Residual risks

- `@nx/eslint-plugin` is installed against the root ESLint 10 peer, and web loads it under ESLint
  9.39.5. This works today (the rule fires and passes as shown). An `@nx/eslint-plugin` upgrade
  must be rechecked with both ESLint versions.
- The daemon was disabled (`NX_DAEMON=false`) for deterministic evidence. Daemon-on runs were not
  exercised.
