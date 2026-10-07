const UNSIGNED_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/u;

/**
 * Query and path values arrive as strings. Only canonical unsigned decimal integers become numbers;
 * anything else (`abc`, `1.5`, `-1`, `0x10`, ``, repeated keys) stays as received so the integer
 * validator rejects it as invalid_request instead of Number() coercing it into a valid value.
 */
export function toStrictInteger(value: unknown): unknown {
  if (typeof value !== "string" || !UNSIGNED_INTEGER_PATTERN.test(value)) {
    return value;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

/** A blank search box means "no filter", as it did in the web; non-strings stay for the validator. */
export function toOptionalSearchText(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}
