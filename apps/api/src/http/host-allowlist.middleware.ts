import type { IncomingMessage, ServerResponse } from "node:http";
import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "../config/index.js";
import { ApiProblem } from "../errors/api-problem.js";

const MISDIRECTED_REQUEST_STATUS = 421;

/**
 * DNS rebinding: a hostile page can point its own name at 127.0.0.1 and reach this loopback server
 * from the victim's browser, but the browser still sends the attacker's name in Host. Only the
 * configured host:port pairs are accepted, compared exactly.
 */
@Injectable()
export class HostAllowlistMiddleware implements NestMiddleware<IncomingMessage, ServerResponse> {
  readonly #allowedHosts: ReadonlySet<string>;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.#allowedHosts = new Set(config.allowedHosts);
  }

  use(request: IncomingMessage, _response: ServerResponse, next: (error?: unknown) => void): void {
    const host = request.headers.host;
    if (host === undefined || !this.#allowedHosts.has(host)) {
      next(new ApiProblem({ code: "host_not_allowed", status: MISDIRECTED_REQUEST_STATUS, message: "host not allowed" }));
      return;
    }
    next();
  }
}
