import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { Injectable } from "@nestjs/common";
import { OUTCOME_CODES, REPORT_SCORE_DECIMALS, type EntryOutcome, type RunSummary } from "@catalog/domain";
import { formatPythonFloat, roundHalfEven } from "./python-format.js";

const TEMP_SUFFIX = ".tmp";
const CODE_COLUMN_WIDTH = 26;
const COUNT_COLUMN_WIDTH = 6;
const TOTAL_LABEL = "TOTAL";
const NOT_WELL_FORMED_MESSAGE = "report text is not well-formed UTF-16";

/**
 * One report line without its newline. The key order is part of the frozen report contract, and
 * `score` is spliced pre-rendered because JSON.stringify would print `1` where Python prints `1.0`.
 */
export function toReportRecord(outcome: EntryOutcome): string {
  const score =
    outcome.score === null
      ? "null"
      : formatPythonFloat(roundHalfEven(outcome.score, REPORT_SCORE_DECIMALS));
  const fields: readonly (readonly [string, string])[] = [
    ["index", JSON.stringify(outcome.index)],
    ["sellerName", JSON.stringify(outcome.sellerName)],
    ["sellerProductId", JSON.stringify(outcome.sellerProductId)],
    ["outcome", JSON.stringify(outcome.outcome)],
    ["productId", JSON.stringify(outcome.productId)],
    ["reviewReason", JSON.stringify(outcome.reviewReason)],
    ["score", score],
    ["warnings", JSON.stringify(outcome.warnings)],
    ["errors", JSON.stringify(outcome.errors)],
  ];
  return `{${fields.map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(",")}}`;
}

export function writeJsonlReport(args: { path: string; outcomes: readonly EntryOutcome[] }): void {
  const { path, outcomes } = args;
  // Python fails encoding a lone surrogate to UTF-8; JSON.stringify would escape it silently.
  // Checking before the temp file opens means a rejected report leaves nothing behind.
  if (!outcomes.every(isWellFormedOutcome)) {
    throw new Error(NOT_WELL_FORMED_MESSAGE);
  }
  const content = Buffer.from(outcomes.map((outcome) => `${toReportRecord(outcome)}\n`).join(""), "utf8");
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}${TEMP_SUFFIX}`;
  try {
    const descriptor = openSync(tempPath, "w");
    try {
      writeFully(descriptor, content);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    // A reader never sees a half-written report: the rename is atomic on one filesystem.
    renameSync(tempPath, path);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

export function formatSummary(summary: RunSummary): string {
  const header =
    `run ${summary.runId} input=${summary.inputLabel}` +
    ` dry_run=${String(summary.dryRun)}` +
    ` committed=${String(summary.committed)}` +
    ` rows_written=${String(summary.rowsWritten)}`;
  // Iterate the vocabulary, not summary.counts, so all eight codes print in frozen order.
  const counts = new Map<string, number>(summary.counts);
  const countLines = OUTCOME_CODES.map((code) => formatCountLine(code, counts.get(code) ?? 0));
  return [header, ...countLines, formatCountLine(TOTAL_LABEL, summary.total)].join("\n");
}

function formatCountLine(label: string, count: number): string {
  return `${label.padEnd(CODE_COLUMN_WIDTH)}${String(count).padStart(COUNT_COLUMN_WIDTH)}`;
}

function isWellFormedOutcome(outcome: EntryOutcome): boolean {
  const texts = [outcome.sellerName, outcome.sellerProductId, ...outcome.errors];
  return texts.every((text) => text === null || text.isWellFormed());
}

// writeSync may write fewer bytes than asked; loop so the report is never silently truncated.
function writeFully(descriptor: number, content: Buffer): void {
  let offset = 0;
  while (offset < content.length) {
    offset += writeSync(descriptor, content, offset, content.length - offset);
  }
}

/** Injectable face of the report helpers; the functions stay exported for plain callers. */
@Injectable()
export class ReportWriter {
  writeJsonlReport(args: { path: string; outcomes: readonly EntryOutcome[] }): void {
    writeJsonlReport(args);
  }

  toReportRecord(outcome: EntryOutcome): string {
    return toReportRecord(outcome);
  }

  formatSummary(summary: RunSummary): string {
    return formatSummary(summary);
  }
}
