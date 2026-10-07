// Python str.strip(), str.split() and len() differ from JS trim(), split(/\s+/) and .length:
// JS \s adds U+FEFF and lacks U+001C-U+001F and U+0085. This provider owns the Python definitions,
// so nothing else in the backend uses \s, trim() or .length on seller text.

import { Injectable } from "@nestjs/common";

// Exactly the 29 code points for which Python str.isspace() is true (verified 2026-10-06).
const PYTHON_WHITESPACE = String.raw`\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000`;

const WHITESPACE_CHARACTER = new RegExp(`^[${PYTHON_WHITESPACE}]$`, "u");
const WHITESPACE_RUN = new RegExp(`[${PYTHON_WHITESPACE}]+`, "u");

// Every Python whitespace code point is in the BMP, so testing UTF-16 code units one at a time is
// exact. Strip scans by index rather than with an end-anchored regex, whose backtracking is
// quadratic on a long whitespace run followed by a non-space character.
function isWhitespaceAt(text: string, index: number): boolean {
  return WHITESPACE_CHARACTER.test(text.charAt(index));
}

@Injectable()
export class TextService {
  pyStrip(text: string): string {
    let start = 0;
    let end = text.length;
    while (start < end && isWhitespaceAt(text, start)) {
      start += 1;
    }
    while (end > start && isWhitespaceAt(text, end - 1)) {
      end -= 1;
    }
    return text.slice(start, end);
  }

  pyIsBlank(text: string): boolean {
    return this.pyStrip(text) === "";
  }

  /** `" ".join(text.split())`. */
  pySplitJoin(text: string): string {
    return text
      .split(WHITESPACE_RUN)
      .filter((part) => part !== "")
      .join(" ");
  }

  /** Python len(): code points, so an astral character counts once. */
  pyLength(text: string): number {
    return Array.from(text).length;
  }
}
