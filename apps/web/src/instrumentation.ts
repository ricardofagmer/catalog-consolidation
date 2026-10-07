import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Validates API_BASE_URL and probes the API once when the Node server boots. `next build` must
// work with the API down and the variable unset, so the build phase is skipped.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return;
  }
  const { checkApiAtBoot } = await import("./lib/api-boot-check");
  checkApiAtBoot();
}
