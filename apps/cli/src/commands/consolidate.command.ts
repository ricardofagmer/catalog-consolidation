import { Injectable } from "@nestjs/common";
import { ConsolidationService } from "@catalog/consolidation";
import type { ConsolidationResult } from "@catalog/domain";
import {
  JsonEntryReaderFactory,
  PythonFormat,
  ReportWriter,
  SqliteConnectionFactory,
  UnitOfWorkFactory,
} from "@catalog/persistence";

export interface ConsolidateArgs {
  readonly db: string;
  readonly input: string;
  readonly report: string | null;
  readonly dryRun: boolean;
  readonly runId: string;
}

@Injectable()
export class ConsolidateCommand {
  constructor(
    private readonly connections: SqliteConnectionFactory,
    private readonly unitsOfWork: UnitOfWorkFactory,
    private readonly entryReaders: JsonEntryReaderFactory,
    private readonly consolidation: ConsolidationService,
    private readonly reportWriter: ReportWriter,
    private readonly pythonFormat: PythonFormat,
  ) {}

  run(args: ConsolidateArgs): Readonly<Record<string, unknown>> {
    // argparse's `type=Path` normalizes every path; the summary header prints str(Path(--input)).
    const inputPath = this.pythonFormat.pythonPathLabel(args.input);
    const connection = this.connections.open(this.pythonFormat.pythonPathLabel(args.db));
    let result: ConsolidationResult;
    try {
      this.connections.requireSchemaVersion(connection);
      // The unit of work opens its transaction when built, so it is created before the entry source.
      const unitOfWork = this.unitsOfWork.create({ connection, mode: "immediate" });
      const entrySource = this.entryReaders.create({ path: inputPath });
      result = this.consolidation.execute({
        unitOfWork,
        entrySource,
        inputLabel: inputPath,
        runId: args.runId,
        dryRun: args.dryRun,
      });
    } finally {
      // The entry file is read after BEGIN, so a rejected file leaves a transaction open; close()
      // discards it, which is why the connection is never reused after a failed run.
      connection.close();
    }
    // Written after the connection is released, as in Python: a report failure cannot hold the lock.
    if (args.report !== null) {
      this.reportWriter.writeJsonlReport({ path: this.pythonFormat.pythonPathLabel(args.report), outcomes: result.outcomes });
    }
    process.stdout.write(`${this.reportWriter.formatSummary(result.summary)}\n`);
    const { summary } = result;
    return {
      dryRun: summary.dryRun,
      committed: summary.committed,
      rowsWritten: summary.rowsWritten,
      total: summary.total,
      counts: Object.fromEntries(summary.counts),
    };
  }
}
