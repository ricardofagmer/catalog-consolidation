import { statSync, type Stats } from "node:fs";
import { Injectable } from "@nestjs/common";
import {
  InvalidInputFileError,
  MAX_INPUT_ENTRIES,
  MAX_INPUT_FILE_BYTES,
  MAX_JSON_NESTING_DEPTH,
  type EntrySource,
  type InputEntry,
} from "@catalog/domain";
import { TextService } from "@catalog/rules";
import { exceedsNestingDepth, pythonUtf8ErrorOffset, readAtMost } from "./json-bytes.js";
import { SellerRecordValidator } from "./seller-record-validator.js";

export interface JsonEntryReaderArgs {
  readonly path: string;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
}

/**
 * Reads a seller JSON array and validates every record at the boundary.
 *
 * File-level problems abort the run with InvalidInputFileError; record-level problems become
 * RejectedEntry values so one bad record never hides the others.
 */
export class JsonEntryReader implements EntrySource {
  private readonly path: string;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly validator: SellerRecordValidator;

  constructor(args: JsonEntryReaderArgs & { readonly text: TextService }) {
    const maxBytes = args.maxBytes ?? MAX_INPUT_FILE_BYTES;
    const maxEntries = args.maxEntries ?? MAX_INPUT_ENTRIES;
    // Python's int arguments cannot be NaN or fractional; reject them here rather than let a
    // NaN limit silently disable the size check.
    if (!Number.isSafeInteger(maxBytes) || !Number.isSafeInteger(maxEntries) || maxBytes < 0 || maxEntries < 0) {
      throw new RangeError("maxBytes and maxEntries must be non-negative integers");
    }
    this.path = args.path;
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.validator = new SellerRecordValidator(args.text);
  }

  read(): readonly InputEntry[] {
    return this.loadRecords().map((record, index) => this.validator.validateRecord(index, record));
  }

  private loadRecords(): readonly unknown[] {
    const raw = this.readBoundedBytes();
    let text: string;
    try {
      // ignoreBOM defaults to false, so the decoder drops exactly one leading U+FEFF, as Python's
      // utf-8-sig does. A second BOM survives into JSON.parse and fails there as not_json.
      text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      throw new InvalidInputFileError({
        code: "not_utf8",
        detail: `${this.path}: invalid UTF-8 at byte offset ${String(pythonUtf8ErrorOffset(raw))}`,
      });
    }
    if (exceedsNestingDepth(text, MAX_JSON_NESTING_DEPTH)) {
      throw new InvalidInputFileError({ code: "not_json", detail: `${this.path}: nesting too deep` });
    }
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch {
      // V8's message quotes the offending input, so it is never surfaced: seller text stays out.
      throw new InvalidInputFileError({ code: "not_json", detail: `${this.path}: invalid JSON` });
    }
    if (!Array.isArray(document)) {
      throw new InvalidInputFileError({
        code: "not_an_array",
        detail: `${this.path}: top-level value is not a JSON array`,
      });
    }
    const records: readonly unknown[] = document;
    if (records.length > this.maxEntries) {
      throw new InvalidInputFileError({
        code: "too_many_entries",
        detail: `${this.path}: ${String(records.length)} entries > limit ${String(this.maxEntries)}`,
      });
    }
    return records;
  }

  private readBoundedBytes(): Buffer {
    let stats: Stats;
    try {
      stats = statSync(this.path);
    } catch {
      throw this.unreadable();
    }
    if (!stats.isFile()) {
      throw this.unreadable();
    }
    if (stats.size > this.maxBytes) {
      throw this.tooLarge(stats.size);
    }
    let raw: Buffer;
    try {
      raw = readAtMost(this.path, this.maxBytes + 1);
    } catch {
      throw this.unreadable();
    }
    // One byte past the limit detects a file that grew between stat and read.
    if (raw.length > this.maxBytes) {
      throw this.tooLarge(raw.length);
    }
    return raw;
  }

  private unreadable(): InvalidInputFileError {
    return new InvalidInputFileError({ code: "unreadable", detail: `${this.path}: not a readable file` });
  }

  private tooLarge(size: number): InvalidInputFileError {
    return new InvalidInputFileError({
      code: "too_large",
      detail: `${this.path}: ${String(size)} bytes > limit ${String(this.maxBytes)}`,
    });
  }
}

/** Builds one reader per Seller File; the reader holds the path, so it is never a singleton. */
@Injectable()
export class JsonEntryReaderFactory {
  constructor(private readonly text: TextService) {}

  create(args: JsonEntryReaderArgs): EntrySource {
    return new JsonEntryReader({ ...args, text: this.text });
  }
}
