import { Injectable } from "@nestjs/common";
import type { ConsolidationResult, EntrySource, UnitOfWork } from "@catalog/domain";
import { MatchingService, NormalizationService } from "@catalog/rules";
import { ConsolidationRun } from "./consolidation-run.js";

export interface ConsolidationRequest {
  readonly unitOfWork: UnitOfWork;
  readonly entrySource: EntrySource;
  readonly inputLabel: string;
  readonly runId: string;
  readonly dryRun: boolean;
}

/** Stateless entry point: every call gets its own ConsolidationRun bound to the caller's unit of work. */
@Injectable()
export class ConsolidationService {
  constructor(
    private readonly normalization: NormalizationService,
    private readonly matching: MatchingService,
  ) {}

  execute(args: ConsolidationRequest): ConsolidationResult {
    const run = new ConsolidationRun({
      unitOfWork: args.unitOfWork,
      entrySource: args.entrySource,
      inputLabel: args.inputLabel,
      runId: args.runId,
      normalization: this.normalization,
      matching: this.matching,
    });
    return run.execute({ dryRun: args.dryRun });
  }
}
