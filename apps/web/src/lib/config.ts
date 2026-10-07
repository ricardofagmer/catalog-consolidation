// The only module that reads process.env: the API address is validated here once and then trusted.
// API_BASE_URL is deliberately not NEXT_PUBLIC_*, so Next never inlines it into a browser bundle.
export interface WebConfig {
  /** Scheme, host and port only, without a trailing slash. */
  readonly apiOrigin: string;
}

const API_BASE_URL_VARIABLE = "API_BASE_URL";
const EXAMPLE_SETTING = "API_BASE_URL=http://127.0.0.1:3001";
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);
const ROOT_PATH = "/";

/** One-line, value-free reason: the rejected value may carry credentials, so it is never echoed. */
export class WebConfigError extends Error {
  constructor(reason: string) {
    super(`${API_BASE_URL_VARIABLE} ${reason}; set it, for example: ${EXAMPLE_SETTING}`);
    this.name = "WebConfigError";
  }
}

// Memoized only on success, so a later call after a failed read validates again.
let validatedConfig: WebConfig | null = null;

export function getWebConfig(): WebConfig {
  if (validatedConfig === null) {
    validatedConfig = { apiOrigin: parseApiOrigin(process.env.API_BASE_URL) };
  }
  return validatedConfig;
}

function parseApiOrigin(raw: string | undefined): string {
  if (raw === undefined || raw === "") {
    throw new WebConfigError("is not set");
  }
  if (!URL.canParse(raw)) {
    throw new WebConfigError("is not a valid URL");
  }
  const url = new URL(raw);
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new WebConfigError("must use the http: or https: scheme");
  }
  if (url.username !== "" || url.password !== "") {
    throw new WebConfigError("must not contain a username or password");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new WebConfigError("must not contain a query string or fragment");
  }
  // Every client path is absolute from the API root (/v1/..., /health/...), so a base path would
  // silently be dropped or doubled depending on the client; it is refused instead.
  if (url.pathname !== ROOT_PATH) {
    throw new WebConfigError("must not contain a path");
  }
  return url.origin;
}
