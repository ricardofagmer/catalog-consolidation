import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/schema.js";

export type ApiClient = Client<paths>;

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

// Per-request headers (Accept, correlation ids) are passed in each call's init; retries are the
// caller's decision, so none are added here.
export function createApiClient(options: ApiClientOptions): ApiClient {
  const clientOptions: ClientOptions = { baseUrl: options.baseUrl };
  if (options.fetch !== undefined) {
    clientOptions.fetch = options.fetch;
  }
  return createClient<paths>(clientOptions);
}
