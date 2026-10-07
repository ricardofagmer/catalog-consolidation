import { closeSync, openSync, readSync } from "node:fs";

const READ_CHUNK_BYTES = 64 * 1024;
const UTF8_BOM_LENGTH = 3;

// Chunked so a large limit never pre-allocates its full size for a small file.
export function readAtMost(path: string, limit: number): Buffer {
  const descriptor = openSync(path, "r");
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    while (total < limit) {
      const chunk = Buffer.alloc(Math.min(READ_CHUNK_BYTES, limit - total));
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(chunk.subarray(0, bytesRead));
      total += bytesRead;
    }
    return Buffer.concat(chunks, total);
  } finally {
    closeSync(descriptor);
  }
}

/**
 * The `UnicodeDecodeError.start` Python reports for the same bytes: the first byte of the first
 * ill-formed sequence (maximal-subpart rule). utf-8-sig decodes the bytes after a leading BOM, so
 * the offset is relative to them.
 */
export function pythonUtf8ErrorOffset(raw: Uint8Array): number {
  const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  const start = hasBom ? UTF8_BOM_LENGTH : 0;
  let index = start;
  while (index < raw.length) {
    const length = wellFormedSequenceLength(raw, index);
    if (length === 0) {
      return index - start;
    }
    index += length;
  }
  return raw.length - start;
}

// Byte ranges from Unicode Table 3-7 (well-formed UTF-8); 0 means ill-formed at `index`.
function wellFormedSequenceLength(raw: Uint8Array, index: number): number {
  const lead = raw[index] ?? 0;
  if (lead < 0x80) {
    return 1;
  }
  const isInRange = (offset: number, low: number, high: number): boolean => {
    const byte = raw[index + offset];
    return byte !== undefined && byte >= low && byte <= high;
  };
  if (lead >= 0xc2 && lead <= 0xdf) {
    return isInRange(1, 0x80, 0xbf) ? 2 : 0;
  }
  if (lead >= 0xe0 && lead <= 0xef) {
    const secondLow = lead === 0xe0 ? 0xa0 : 0x80;
    const secondHigh = lead === 0xed ? 0x9f : 0xbf;
    return isInRange(1, secondLow, secondHigh) && isInRange(2, 0x80, 0xbf) ? 3 : 0;
  }
  if (lead >= 0xf0 && lead <= 0xf4) {
    const secondLow = lead === 0xf0 ? 0x90 : 0x80;
    const secondHigh = lead === 0xf4 ? 0x8f : 0xbf;
    return isInRange(1, secondLow, secondHigh) && isInRange(2, 0x80, 0xbf) && isInRange(3, 0x80, 0xbf) ? 4 : 0;
  }
  return 0;
}

/**
 * Linear scan for array/object depth outside string literals. It runs before JSON.parse, so it
 * sees text that may not be valid JSON; anything it lets through is still judged by JSON.parse.
 */
export function exceedsNestingDepth(text: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") {
        // The escaped character (a quote included) never ends the string.
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === "[" || char === "{") {
      depth += 1;
      if (depth > maxDepth) {
        return true;
      }
    } else if (char === "]" || char === "}") {
      depth -= 1;
    }
  }
  return false;
}
