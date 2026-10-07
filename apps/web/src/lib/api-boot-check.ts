import { isApiReady } from "./api-transport";
import { getWebConfig, WebConfigError } from "./config";

/**
 * Server-boot check. A missing or malformed API_BASE_URL exits with one line, since Next only logs a
 * throwing register() and would keep serving error pages. Readiness is probed once in the
 * background and only warned about: the API may start after the web.
 */
export function checkApiAtBoot(): void {
  let apiOrigin: string;
  try {
    apiOrigin = getWebConfig().apiOrigin;
  } catch (error: unknown) {
    const message = error instanceof WebConfigError ? error.message : "API_BASE_URL could not be read";
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
  void warnUnlessReady(apiOrigin);
}

async function warnUnlessReady(apiOrigin: string): Promise<void> {
  if (!(await isApiReady())) {
    process.stderr.write(`warn: API at ${apiOrigin} is not ready; pages will show the error state until it is\n`);
  }
}
