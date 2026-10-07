# 04: Nest CLI: review, help forms, golden check

**What to build:** `review list` and `review resolve` run on a `reviews` provider library, every help form is safe, and `scripts/parity-check.sh` becomes the golden-file check run against the Nest CLI. After this ticket the Nest CLI fully replaces the previous CLI and is proven equal to the recorded fixtures in every scenario, including the review flow.

**Blocked by:** 03

**Closes checks:** C4, C5

**Status:** done

- [ ] The golden check exits 0 with one OK line per scenario across first run, re-run, dry run, error paths and the review flow
- [ ] Review resolution (link candidate, link other, create, reject, already resolved) keeps the same transaction semantics and results as before
- [ ] `-h`, `--help` and `-hh` at every command level print help, exit 0, write nothing and create no backup (database checksum unchanged)
- [ ] The old CLI app and the Python-versus-TypeScript comparison mode are removed from the script; the golden mode is the only mode
- [ ] The golden check passes again at the end of this ticket with Python still present but unused

## Comments
