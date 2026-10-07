export interface ApiConfig {
  readonly dbPath: string;
  readonly port: number;
  readonly allowedHosts: readonly string[];
}

export const API_CONFIG = "API_CONFIG";

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigError";
  }
}

const DB_PATH_VARIABLE = "CATALOG_DB_PATH";
const PORT_VARIABLE = "API_PORT";
const ALLOWED_HOSTS_VARIABLE = "API_ALLOWED_HOSTS";
const DEFAULT_PORT = 3001;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const DECIMAL_RADIX = 10;
const PORT_PATTERN = /^[0-9]{1,5}$/u;
// A DNS name or bracketed IPv6 literal, optionally followed by a port: exactly what a Host header carries.
const HOST_ENTRY_PATTERN = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::[0-9]{1,5})?$/u;
const LOOPBACK_NAMES = ["127.0.0.1", "localhost"] as const;

export interface ApiConfigSource {
  readonly env: EnvironmentSource;
  readonly isRegularFile: (path: string) => boolean;
}

/** Pure validation: every failure is one ApiConfigError whose message fits on one line. */
export function parseApiConfig(source: ApiConfigSource): ApiConfig {
  const dbPath = parseDbPath(source);
  const port = parsePort(readSetting(source.env, PORT_VARIABLE));
  const allowedHosts = parseAllowedHosts({ raw: readSetting(source.env, ALLOWED_HOSTS_VARIABLE), port });
  return { dbPath, port, allowedHosts };
}

// An empty value counts as unset, as in the web configuration it replaces.
function readSetting(env: EnvironmentSource, name: string): string | null {
  const value = env[name];
  return value === undefined || value === "" ? null : value;
}

function parseDbPath(source: ApiConfigSource): string {
  const dbPath = readSetting(source.env, DB_PATH_VARIABLE);
  if (dbPath === null) {
    throw new ApiConfigError(`${DB_PATH_VARIABLE} is not set`);
  }
  if (!source.isRegularFile(dbPath)) {
    // JSON quoting keeps a path with control characters on the single error line.
    throw new ApiConfigError(
      `${DB_PATH_VARIABLE} ${JSON.stringify(dbPath)}: is not a regular file`,
    );
  }
  return dbPath;
}

function parsePort(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_PORT;
  }
  const port = PORT_PATTERN.test(raw) ? Number.parseInt(raw, DECIMAL_RADIX) : Number.NaN;
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new ApiConfigError(
      `${PORT_VARIABLE} must be an integer between ${String(MIN_PORT)} and ${String(MAX_PORT)}`,
    );
  }
  return port;
}

function parseAllowedHosts(args: { readonly raw: string | null; readonly port: number }): readonly string[] {
  if (args.raw === null) {
    return LOOPBACK_NAMES.map((name) => `${name}:${String(args.port)}`);
  }
  const entries = args.raw.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => !HOST_ENTRY_PATTERN.test(entry))) {
    throw new ApiConfigError(
      `${ALLOWED_HOSTS_VARIABLE} must be a comma-separated list of host[:port] entries`,
    );
  }
  return [...new Set(entries)];
}
