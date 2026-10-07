# 02: Nx workspace and boundaries

**What to build:** The pnpm workspace becomes an Nx workspace with tasks inferred from each tool's own configuration, a task cache, `affected` selection, and module-boundary lint rules driven by project tags. A web-tagged project may depend only on the generated API client and shared presentation code; backend-tagged projects may not depend on web. The existing apps and the existing `core` package are registered as Nx projects so nothing regresses.

**Blocked by:** 01

**Closes checks:** C2, C3

**Status:** done

- [ ] Nx 23 is installed and pinned; `build`, `lint` and `typecheck` run through Nx for the existing projects and a second identical run is a cache hit
- [ ] Project tags and the boundary lint rule exist; a forbidden import added on a scratch copy fails `nx lint web` naming the rule, and the real tree passes
- [ ] `nx show projects --affected --files=<one file>` selects the changed project and its dependents only (documented as the no-git form)
- [ ] The fixture check from ticket 01 still passes after the workspace change
- [ ] ESLint and TypeScript versions stay compatible with Nx (the web app keeps its own ESLint pin)

## Comments
