#!/usr/bin/env node
// Decorator metadata must be registered before any Nest-decorated class is loaded.
import "reflect-metadata";
import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DatabaseFileError, InvalidInputFileError, MigrationError, ReviewResolutionError } from "@catalog/domain";
import { isSqliteError } from "@catalog/persistence";
import { parseCommandLine, type ParsedCommand } from "./arguments.js";
import { CliModule } from "./cli.module.js";
import { ConsolidateCommand } from "./commands/consolidate.command.js";
import { MigrateCommand } from "./commands/migrate.command.js";
import { ReviewCommand } from "./commands/review.command.js";
import { EXIT_FAILURE, EXIT_INVALID_INPUT, EXIT_OK, type ExitCode } from "./exit-codes.js";
import { elapsedMs, logEvent, newCorrelationId, startTimer } from "./logging.js";

// argparse prefixes its error line with the (sub)command prog, e.g. `catalog-consolidation review
// list`; every usage line T6 builds is `usage: <prog> [-h] ...`, so the prog is read back from it.
const PROGRAM_NAME = "catalog-consolidation";
const USAGE_PROG_PATTERN = /^usage: (.+?) \[-h\]/u;

type LogFields = Readonly<Record<string, unknown>>;
type RunnableCommand = Exclude<ParsedCommand, { readonly kind: "help" | "usage-error" }>;

interface ExpectedFailure {
  readonly exitCode: ExitCode;
  readonly message: string;
}

interface CommandPlan {
  readonly event: string;
  readonly action: (app: INestApplicationContext) => LogFields | Promise<LogFields>;
  // Typed domain errors this command answers with its own message; everything else is generic.
  readonly describeExpected: (error: unknown) => ExpectedFailure | null;
}

let outputLost = false;

export async function main(argv: readonly string[]): Promise<ExitCode> {
  const parsed = parseCommandLine(argv);
  // Help and usage errors are answered before Nest boots, so they can never open a database.
  if (parsed.kind === "help") {
    process.stdout.write(`${parsed.text}\n`);
    return EXIT_OK;
  }
  if (parsed.kind === "usage-error") {
    // Usage errors never log a JSON line: no command ran, so there is no correlation id to report.
    process.stderr.write(`${parsed.usage}\n${usageProg(parsed.usage)}: error: ${parsed.message}\n`);
    return EXIT_INVALID_INPUT;
  }
  const correlationId = newCorrelationId();
  return runPlan(planCommand(parsed, correlationId), correlationId);
}

function usageProg(usage: string): string {
  return USAGE_PROG_PATTERN.exec(usage)?.[1] ?? PROGRAM_NAME;
}

function planCommand(command: RunnableCommand, correlationId: string): CommandPlan {
  switch (command.kind) {
    case "migrate":
      return {
        event: "migrate",
        action: (app) => app.get(MigrateCommand).run({ db: command.db }),
        describeExpected: describeBatchFailure,
      };
    case "consolidate":
      return {
        event: "consolidate",
        action: (app) =>
          app.get(ConsolidateCommand).run({
            db: command.db,
            input: command.input,
            report: command.report,
            dryRun: command.dryRun,
            runId: correlationId,
          }),
        describeExpected: describeBatchFailure,
      };
    case "review-list":
      return {
        event: "review.list",
        action: (app) =>
          app
            .get(ReviewCommand)
            .list({ db: command.db, status: command.status, limit: command.limit, afterId: command.afterId }),
        describeExpected: describeReviewFailure,
      };
    case "review-resolve":
      return {
        event: "review.resolve",
        action: (app) => app.get(ReviewCommand).resolve({ db: command.db, command: command.command }),
        describeExpected: describeReviewFailure,
      };
  }
}

async function runPlan(plan: CommandPlan, correlationId: string): Promise<ExitCode> {
  const startedAt = startTimer();
  let fields: LogFields;
  try {
    fields = await withApplication(plan.action);
  } catch (error: unknown) {
    const failure = plan.describeExpected(error) ?? describeGenericFailure(error, correlationId);
    // Typed error messages carry codes, ids and paths only; seller text never reaches stderr.
    process.stderr.write(`error: ${failure.message}\n`);
    logEvent({
      level: "error",
      event: `${plan.event}.failed`,
      fields: { correlationId, errorType: errorTypeName(error), durationMs: elapsedMs(startedAt) },
    });
    return failure.exitCode;
  }
  logEvent({
    level: "info",
    event: `${plan.event}.finished`,
    fields: { correlationId, durationMs: elapsedMs(startedAt), ...fields },
  });
  return EXIT_OK;
}

// Nest's logger is off so stdout carries only the command output; abortOnError is off so a boot
// failure is thrown into runPlan (generic error line, exit 1) instead of aborting the process.
async function withApplication(
  action: (app: INestApplicationContext) => LogFields | Promise<LogFields>,
): Promise<LogFields> {
  const app = await NestFactory.createApplicationContext(CliModule, { logger: false, abortOnError: false });
  try {
    return await action(app);
  } finally {
    await app.close();
  }
}

function describeBatchFailure(error: unknown): ExpectedFailure | null {
  if (error instanceof InvalidInputFileError) {
    return { exitCode: EXIT_INVALID_INPUT, message: `invalid input file: ${error.message}` };
  }
  if (error instanceof DatabaseFileError) {
    return { exitCode: EXIT_INVALID_INPUT, message: `database: ${error.message}` };
  }
  if (error instanceof MigrationError) {
    return { exitCode: EXIT_FAILURE, message: `migration failed: ${error.message}` };
  }
  return null;
}

function describeReviewFailure(error: unknown): ExpectedFailure | null {
  if (error instanceof ReviewResolutionError || error instanceof DatabaseFileError) {
    return { exitCode: EXIT_INVALID_INPUT, message: error.message };
  }
  return null;
}

// node:sqlite messages can echo bound values, and unexpected errors (including the migration
// runner's refusal to overwrite a backup) can echo paths or data: neither reaches stderr verbatim.
function describeGenericFailure(error: unknown, correlationId: string): ExpectedFailure {
  const kind = isSqliteError(error) ? "database failure" : "unexpected failure";
  return { exitCode: EXIT_FAILURE, message: `${kind} (correlationId=${correlationId})` };
}

function errorTypeName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

// A reader that closes early (`| head -1`) makes the next write fail with EPIPE; that is the
// reader's choice, not a crash, so it ends quietly instead of printing a stack trace.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EPIPE") {
    throw error;
  }
  // Output was lost, so success must not be reported; an earlier failure code is kept as is.
  outputLost = true;
  if (process.exitCode === undefined || process.exitCode === EXIT_OK) {
    process.exitCode = EXIT_FAILURE;
  }
});

// The exit code is set rather than calling process.exit(), so piped stdout drains before exit.
// Closing the Nest context adds ticks after the last write, so an EPIPE seen meanwhile must not be
// overwritten by the command's success code.
void main(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = outputLost && exitCode === EXIT_OK ? EXIT_FAILURE : exitCode;
});
