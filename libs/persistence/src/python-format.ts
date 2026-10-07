import { Injectable } from "@nestjs/common";

// Python rendering rules the report, the summary and `review list` must reproduce byte for byte
// (spec section 5.4).

const SUPPORTED_DECIMALS = 4;
const DECIMAL_SCALE = 10_000;
// At four decimals the only exactly representable ties are the odd multiples of 1/32.
const TIE_SCALE = 32;
const DOUBLE_SLASH_PREFIX = "//";
const SLASH_PREFIX = "/";
const CURRENT_DIRECTORY = ".";

/**
 * Python `round(x, 4)`: half-to-even on the exact binary value. `toFixed` rounds ties up, so the
 * tie case is resolved by hand; every other value already rounds the same way in both.
 */
export function roundHalfEven(value: number, decimals: number): number {
  if (decimals !== SUPPORTED_DECIMALS) {
    throw new RangeError(`roundHalfEven supports ${String(SUPPORTED_DECIMALS)} decimals only, got ${String(decimals)}`);
  }
  const scaled = value * TIE_SCALE;
  if (Number.isInteger(scaled) && scaled % 2 !== 0) {
    // value * 10000 is exact here (an odd multiple of 0.5), so floor yields the lower neighbour.
    const lower = Math.floor(value * DECIMAL_SCALE);
    const even = lower % 2 === 0 ? lower : lower + 1;
    return even / DECIMAL_SCALE;
  }
  return Number(value.toFixed(SUPPORTED_DECIMALS));
}

/** Python `repr(float)`: both are shortest round-trip; Python keeps `.0` on integral values. */
export function formatPythonFloat(value: number): string {
  const text = String(value);
  return Number.isInteger(value) ? `${text}.0` : text;
}

/** Python `f"{x:.4f}"`, which is half-to-even on the exact value. */
export function formatFixed(value: number, decimals: number): string {
  return roundHalfEven(value, decimals).toFixed(decimals);
}

/**
 * Python `str(PurePosixPath(text))`, which the CLI prints as the input label. POSIX keeps exactly
 * two leading slashes as-is and collapses three or more to one; `.` segments vanish, `..` stays.
 */
export function pythonPathLabel(text: string): string {
  const prefix = leadingSlashPrefix(text);
  const joined = text
    .split("/")
    .filter((segment) => segment !== "" && segment !== CURRENT_DIRECTORY)
    .join("/");
  const label = prefix + joined;
  return label === "" ? CURRENT_DIRECTORY : label;
}

function leadingSlashPrefix(text: string): string {
  if (text.startsWith(DOUBLE_SLASH_PREFIX) && !text.startsWith("///")) {
    return DOUBLE_SLASH_PREFIX;
  }
  return text.startsWith(SLASH_PREFIX) ? SLASH_PREFIX : "";
}

/** Injectable face of the Python rendering helpers; the functions stay exported for plain callers. */
@Injectable()
export class PythonFormat {
  roundHalfEven(value: number, decimals: number): number {
    return roundHalfEven(value, decimals);
  }

  formatPythonFloat(value: number): string {
    return formatPythonFloat(value);
  }

  formatFixed(value: number, decimals: number): string {
    return formatFixed(value, decimals);
  }

  pythonPathLabel(text: string): string {
    return pythonPathLabel(text);
  }
}
