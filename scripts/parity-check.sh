#!/usr/bin/env bash
# Kept so `pnpm parity` keeps working: the golden-file check is the only mode (ticket 04). Every
# argument and the GOLDEN_CLI / GOLDEN_PROG variables pass through to scripts/golden-check.sh.
set -euo pipefail
exec "$(dirname "$0")/golden-check.sh" "$@"
