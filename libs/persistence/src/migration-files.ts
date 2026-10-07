import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { MigrationError } from "@catalog/domain";

const FILENAME_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const MIGRATION_SUFFIX = ".sql";
const CHECKSUM_ALGORITHM = "sha256";

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly path: string;
  readonly checksum: string;
}

export function discover(directory: string): readonly MigrationFile[] {
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new MigrationError({ code: "version_gap", detail: `migrations directory not found: ${directory}` });
  }
  const files: MigrationFile[] = [];
  for (const fileName of readdirSync(directory)) {
    if (!fileName.endsWith(MIGRATION_SUFFIX)) {
      continue;
    }
    const match = FILENAME_PATTERN.exec(fileName);
    const versionText = match?.[1];
    const name = match?.[2];
    if (versionText === undefined || name === undefined) {
      throw new MigrationError({ code: "invalid_filename", detail: `${fileName} does not match NNNN_name.sql` });
    }
    const path = join(directory, fileName);
    files.push({
      version: Number.parseInt(versionText, 10),
      name,
      path,
      checksum: sha256Hex(readFileSync(path)),
    });
  }
  files.sort((left, right) => left.version - right.version);
  const versions = files.map((migration) => migration.version);
  if (versions.length === 0 || versions.some((version, index) => version !== index + 1)) {
    throw new MigrationError({
      code: "version_gap",
      detail: `versions must run contiguously from 1, found ${pythonTuple(versions)} in ${directory}`,
    });
  }
  return files;
}

export function verifyApplied(files: readonly MigrationFile[], applied: ReadonlyMap<number, string>): void {
  const byVersion = new Map(files.map((migration) => [migration.version, migration]));
  for (const [version, checksum] of applied) {
    const migration = byVersion.get(version);
    if (migration === undefined) {
      throw new MigrationError({
        code: "version_gap",
        detail: `database has version ${String(version)} applied but no migration file for it`,
      });
    }
    if (migration.checksum !== checksum) {
      throw new MigrationError({
        code: "checksum_mismatch",
        detail: `${basename(migration.path)} was edited after it was applied`,
      });
    }
  }
}

export function readVerifiedScript(migration: MigrationFile): string {
  const content = readFileSync(migration.path);
  if (sha256Hex(content) !== migration.checksum) {
    throw new MigrationError({
      code: "checksum_mismatch",
      detail: `${basename(migration.path)} changed between discovery and apply`,
    });
  }
  // Strict and BOM-preserving, like Python's bytes.decode("utf-8").
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
}

function sha256Hex(content: Uint8Array): string {
  return createHash(CHECKSUM_ALGORITHM).update(content).digest("hex");
}

// Mirrors the Python detail text, which prints the versions as a tuple.
function pythonTuple(values: readonly number[]): string {
  if (values.length === 1) {
    return `(${String(values[0])},)`;
  }
  return `(${values.map(String).join(", ")})`;
}
