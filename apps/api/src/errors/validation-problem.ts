import type { ValidationError } from "class-validator";
import { ApiProblem } from "./api-problem.js";

const BAD_REQUEST_STATUS = 400;
const MAX_LISTED_FIELDS = 10;
// Property names can be client-chosen (forbidNonWhitelisted reports unknown keys), so only
// identifier-like names are repeated back; anything else is reported generically.
const SAFE_FIELD_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const UNNAMED_FIELD = "<unnamed>";

/** ValidationPipe exceptionFactory: names the failing fields, never their values. */
export function validationProblem(errors: readonly ValidationError[]): ApiProblem {
  const fields = [...new Set(errors.flatMap((error) => failingPaths(error, [])))];
  const listed = fields.slice(0, MAX_LISTED_FIELDS);
  const more = fields.length > listed.length ? ` (+${String(fields.length - listed.length)} more)` : "";
  const message =
    listed.length === 0 ? "invalid request" : `invalid request fields: ${listed.join(", ")}${more}`;
  return new ApiProblem({ code: "invalid_request", status: BAD_REQUEST_STATUS, message });
}

function failingPaths(error: ValidationError, parents: readonly string[]): string[] {
  const path = [...parents, SAFE_FIELD_PATTERN.test(error.property) ? error.property : UNNAMED_FIELD];
  const own = error.constraints !== undefined && Object.keys(error.constraints).length > 0 ? [path.join(".")] : [];
  const nested = (error.children ?? []).flatMap((child) => failingPaths(child, path));
  return [...own, ...nested];
}
