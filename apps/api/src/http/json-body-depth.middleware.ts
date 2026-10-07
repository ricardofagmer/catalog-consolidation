import type { IncomingMessage, ServerResponse } from "node:http";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { validationProblem } from "../errors/validation-problem.js";

// The top-level body is depth 1 and a container value inside it is depth 2. Every request DTO of
// this API is flat (depth 1); the margin leaves room for future nested DTOs.
const MAX_JSON_BODY_DEPTH = 16;
// Express's JSON parser attaches the parsed value here; it is undefined when no body was parsed.
const PARSED_BODY_PROPERTY = "body";

interface PendingNode {
  readonly value: unknown;
  readonly depth: number;
}

/**
 * The 16 KB body limit still admits about 8000 levels of nesting, and class-transformer (run by the
 * global ValidationPipe with transform: true) recurses once per level until a RangeError surfaces as
 * a 500. Bounding depth here, right after the JSON parser, turns such bodies into the ordinary 400
 * invalid_request for every JSON endpoint. The walk uses an explicit stack and never descends past
 * the bound, so the check itself cannot overflow and costs at most one visit per parsed value.
 */
@Injectable()
export class JsonBodyDepthMiddleware implements NestMiddleware<IncomingMessage, ServerResponse> {
  use(request: IncomingMessage, _response: ServerResponse, next: (error?: unknown) => void): void {
    const body: unknown = Reflect.get(request, PARSED_BODY_PROPERTY);
    if (exceedsDepth(body, MAX_JSON_BODY_DEPTH)) {
      next(validationProblem([]));
      return;
    }
    next();
  }
}

function exceedsDepth(root: unknown, maxDepth: number): boolean {
  const pending: PendingNode[] = [{ value: root, depth: 1 }];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (typeof node.value !== "object" || node.value === null) {
      continue;
    }
    if (node.depth > maxDepth) {
      return true;
    }
    for (const child of Object.values(node.value)) {
      pending.push({ value: child, depth: node.depth + 1 });
    }
  }
  return false;
}
