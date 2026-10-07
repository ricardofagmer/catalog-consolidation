import {
  BACKFILL_BATCH_SIZE,
  OUTCOME_CODES,
  isCreateDecision,
  isHoldDecision,
  isLinkDecision,
  isRejectedEntry,
  type CatalogRepository,
  type ConsolidationResult,
  type CreateDecision,
  type EntryOutcome,
  type EntrySource,
  type HoldDecision,
  type InputEntry,
  type LinkDecision,
  type MatchQuery,
  type OutcomeCode,
  type RunSummary,
  type SellerEntry,
  type SellerLink,
  type UnitOfWork,
  type WarningCode,
} from "@catalog/domain";
import type { MatchingService, NormalizationService } from "@catalog/rules";
import { newLink, outcomeFor, pendingReviewOutcome, rejectedOutcome } from "./entry-outcomes.js";

const UNNORMALIZABLE_NAME_ERROR = "unnormalizable:Name";

export interface ConsolidationRunArgs {
  readonly unitOfWork: UnitOfWork;
  readonly entrySource: EntrySource;
  readonly inputLabel: string;
  readonly runId: string;
  readonly normalization: NormalizationService;
  readonly matching: MatchingService;
}

/**
 * Consolidates one seller file into the catalog inside a single transaction (frozen rule G).
 *
 * One instance per run: it holds that run's unit of work and labels, which is why the injectable
 * ConsolidationService stays stateless and builds a fresh run for every call.
 */
export class ConsolidationRun {
  private readonly unitOfWork: UnitOfWork;
  private readonly entrySource: EntrySource;
  private readonly inputLabel: string;
  private readonly runId: string;
  private readonly normalization: NormalizationService;
  private readonly matching: MatchingService;

  constructor(args: ConsolidationRunArgs) {
    this.unitOfWork = args.unitOfWork;
    this.entrySource = args.entrySource;
    this.inputLabel = args.inputLabel;
    this.runId = args.runId;
    this.normalization = args.normalization;
    this.matching = args.matching;
  }

  execute(args: { dryRun: boolean }): ConsolidationResult {
    // Read before the transaction work starts: an invalid file writes nothing.
    const entries = this.entrySource.read();
    let outcomes: readonly EntryOutcome[];
    let rowsWritten: number;
    try {
      this.healMatchKeys();
      outcomes = entries.map((item) => this.consolidate(item));
      rowsWritten = this.unitOfWork.rowsWritten();
      if (!args.dryRun) {
        this.unitOfWork.commit();
      }
    } catch (error) {
      this.unitOfWork.rollback();
      throw error;
    }
    if (args.dryRun) {
      this.unitOfWork.rollback();
    }
    return {
      outcomes,
      summary: this.summarize({ outcomes, rowsWritten, dryRun: args.dryRun }),
    };
  }

  private get catalog(): CatalogRepository {
    return this.unitOfWork.catalog;
  }

  private healMatchKeys(): void {
    // Products written by other tools carry NULL match keys and would be invisible to
    // matching. A name that normalizes to nothing stays NULL so a re-run writes 0 rows.
    let afterId = 0;
    for (;;) {
      const batch = this.catalog.listProductsMissingMatchKeys({ afterId, limit: BACKFILL_BATCH_SIZE });
      for (const source of batch) {
        const normalizedName = this.normalization.normalize(source.name);
        if (normalizedName !== null) {
          this.catalog.setMatchKeys({
            productId: source.productId,
            normalizedName,
            normalizedBrand: this.normalization.normalize(source.brand),
          });
        }
      }
      const last = batch.at(-1);
      if (batch.length < BACKFILL_BATCH_SIZE || last === undefined) {
        return;
      }
      afterId = last.productId;
    }
  }

  private consolidate(item: InputEntry): EntryOutcome {
    if (isRejectedEntry(item)) {
      return rejectedOutcome(item);
    }
    const normalizedName = this.normalization.normalize(item.name);
    if (normalizedName === null) {
      return outcomeFor(item, { outcome: "REJECTED_INVALID", errors: [UNNORMALIZABLE_NAME_ERROR] });
    }
    const query: MatchQuery = {
      rawName: item.name,
      normalizedName,
      normalizedBrand: this.normalization.normalize(item.brand),
    };
    const link = this.catalog.findLinkBySku({
      sellerName: item.sellerName,
      sellerProductId: item.sellerProductId,
    });
    if (link !== null) {
      return this.recheckExistingLink({ entry: item, query, link });
    }
    const review = this.catalog.findReviewBySku({
      sellerName: item.sellerName,
      sellerProductId: item.sellerProductId,
    });
    if (review !== null) {
      return pendingReviewOutcome({ entry: item, review });
    }
    const decision = this.matching.matchEntry({ query, catalog: this.catalog });
    if (isHoldDecision(decision)) {
      return this.hold({ entry: item, decision });
    }
    if (isCreateDecision(decision)) {
      return this.create({ entry: item, query, decision });
    }
    return this.link({ entry: item, decision });
  }

  private recheckExistingLink(args: { entry: SellerEntry; query: MatchQuery; link: SellerLink }): EntryOutcome {
    const { entry, query, link } = args;
    // A human-confirmed link is authoritative: the automatic matcher never links fuzzy
    // candidates, so re-matching it would report a false conflict on every re-run.
    if (link.matchType === "REVIEWED") {
      return outcomeFor(entry, { outcome: "UNCHANGED", productId: link.productId });
    }
    const decision = this.matching.matchEntry({ query, catalog: this.catalog });
    if (isLinkDecision(decision) && decision.productId === link.productId) {
      return outcomeFor(entry, { outcome: "UNCHANGED", productId: link.productId });
    }
    return outcomeFor(entry, { outcome: "CONFLICT_SELLER_SKU", productId: link.productId });
  }

  private hold(args: { entry: SellerEntry; decision: HoldDecision }): EntryOutcome {
    const { entry, decision } = args;
    this.catalog.enqueueReview({
      sellerName: entry.sellerName,
      sellerProductId: entry.sellerProductId,
      sourceName: entry.name,
      sourceBrand: entry.brand,
      sourceCategory: entry.category,
      candidateProductId: decision.candidateProductId,
      score: decision.score,
      reason: decision.reason,
    });
    const extraWarnings: readonly WarningCode[] = decision.reason === "AMBIGUOUS" ? ["ambiguous_candidates"] : [];
    return outcomeFor(entry, {
      outcome: "HELD_FOR_REVIEW",
      productId: decision.candidateProductId,
      reviewReason: decision.reason,
      score: decision.score,
      extraWarnings,
    });
  }

  private create(args: { entry: SellerEntry; query: MatchQuery; decision: CreateDecision }): EntryOutcome {
    const { entry, query, decision } = args;
    const productId = this.catalog.insertProduct({
      name: this.requiredDisplay(entry.name),
      brand: this.normalization.cleanDisplay(entry.brand),
      category: this.normalization.cleanDisplay(entry.category),
      normalizedName: query.normalizedName,
      normalizedBrand: query.normalizedBrand,
    });
    this.catalog.insertLink(newLink({ entry, productId, matchType: "CREATED" }));
    return outcomeFor(entry, { outcome: "CREATED", productId, score: decision.bestScore });
  }

  private link(args: { entry: SellerEntry; decision: LinkDecision }): EntryOutcome {
    const { entry, decision } = args;
    const existing = this.catalog.findLinkBySellerProduct({
      sellerName: entry.sellerName,
      productId: decision.productId,
    });
    if (existing !== null) {
      return outcomeFor(entry, { outcome: "SKIPPED_DUPLICATE_LISTING", productId: decision.productId });
    }
    this.catalog.insertLink(newLink({ entry, productId: decision.productId, matchType: decision.matchType }));
    const outcome: OutcomeCode = decision.matchType === "EXACT" ? "LINKED_EXACT" : "LINKED_NORMALIZED";
    const extraWarnings: readonly WarningCode[] =
      decision.brandCheck === "one_side_null" ? ["brand_unverified_null"] : [];
    return outcomeFor(entry, { outcome, productId: decision.productId, extraWarnings });
  }

  private summarize(args: { outcomes: readonly EntryOutcome[]; rowsWritten: number; dryRun: boolean }): RunSummary {
    const tally = new Map<OutcomeCode, number>();
    for (const outcome of args.outcomes) {
      tally.set(outcome.outcome, (tally.get(outcome.outcome) ?? 0) + 1);
    }
    return {
      runId: this.runId,
      inputLabel: this.inputLabel,
      total: args.outcomes.length,
      counts: OUTCOME_CODES.map((code): readonly [OutcomeCode, number] => [code, tally.get(code) ?? 0]),
      rowsWritten: args.rowsWritten,
      dryRun: args.dryRun,
      committed: !args.dryRun,
    };
  }

  private requiredDisplay(name: string): string {
    const display = this.normalization.cleanDisplay(name);
    // Unreachable in practice: a name that normalizes to a value is never blank.
    if (display === null) {
      throw new Error("a normalizable name has no display form");
    }
    return display;
  }
}
