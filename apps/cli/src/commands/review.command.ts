import { Injectable } from "@nestjs/common";
import {
  REPORT_SCORE_DECIMALS,
  type ResolutionResult,
  type ResolveCommand,
  type ReviewPage,
  type ReviewRecord,
  type ReviewStatus,
} from "@catalog/domain";
import { PythonFormat, ReviewUnitOfWorkFactory, SqliteConnectionFactory } from "@catalog/persistence";
import { ReviewsService } from "@catalog/reviews";
import { NormalizationService } from "@catalog/rules";

const LIST_HEADER = ["Id", "SellerName", "SellerProductId", "Reason", "Score", "CandidateProductId", "SourceName"];
const COLUMN_SEPARATOR = "\t";

export interface ReviewListArgs {
  readonly db: string;
  readonly status: ReviewStatus;
  readonly limit: number;
  readonly afterId: number;
}

export interface ReviewResolveArgs {
  readonly db: string;
  readonly command: ResolveCommand;
}

@Injectable()
export class ReviewCommand {
  constructor(
    private readonly connections: SqliteConnectionFactory,
    private readonly unitsOfWork: ReviewUnitOfWorkFactory,
    private readonly reviews: ReviewsService,
    private readonly normalization: NormalizationService,
    private readonly pythonFormat: PythonFormat,
  ) {}

  list(args: ReviewListArgs): Readonly<Record<string, unknown>> {
    const connection = this.connections.open(this.pythonFormat.pythonPathLabel(args.db));
    let page: ReviewPage;
    try {
      this.connections.requireSchemaVersion(connection);
      page = this.reviews.list({
        unitOfWork: this.unitsOfWork.create({ connection }),
        status: args.status,
        afterId: args.afterId,
        limit: args.limit,
      });
    } finally {
      connection.close();
    }
    this.printPage(page);
    return { status: args.status, rows: page.records.length, hasMore: page.nextAfterId !== null };
  }

  resolve(args: ReviewResolveArgs): Readonly<Record<string, unknown>> {
    const connection = this.connections.open(this.pythonFormat.pythonPathLabel(args.db));
    let result: ResolutionResult;
    try {
      this.connections.requireSchemaVersion(connection);
      result = this.reviews.resolve({
        unitOfWork: this.unitsOfWork.create({ connection, mode: "immediate" }),
        command: args.command,
      });
    } finally {
      connection.close();
    }
    printResolution(result);
    return { reviewId: result.reviewId, status: result.status, productId: result.productId, linkId: result.linkId };
  }

  private printPage(page: ReviewPage): void {
    process.stdout.write(`${LIST_HEADER.join(COLUMN_SEPARATOR)}\n`);
    for (const record of page.records) {
      process.stdout.write(`${this.listColumns(record).join(COLUMN_SEPARATOR)}\n`);
    }
    if (page.nextAfterId !== null) {
      process.stdout.write(`next: --after-id ${String(page.nextAfterId)}\n`);
    }
  }

  private listColumns(record: ReviewRecord): readonly string[] {
    const { item } = record;
    return [
      String(item.id),
      this.singleLine(item.sellerName),
      item.sellerProductId,
      item.reason,
      item.score === null ? "" : this.pythonFormat.formatFixed(item.score, REPORT_SCORE_DECIMALS),
      item.candidateProductId === null ? "" : String(item.candidateProductId),
      this.singleLine(record.sourceName),
    ];
  }

  // Seller text may hold tabs or newlines; collapsing them keeps one row per line.
  private singleLine(text: string): string {
    return this.normalization.cleanDisplay(text) ?? "";
  }
}

function printResolution(result: ResolutionResult): void {
  let line = `review ${String(result.reviewId)} -> ${result.status}`;
  if (result.productId !== null) {
    line += ` product=${String(result.productId)} link=${String(result.linkId)}`;
  }
  process.stdout.write(`${line}\n`);
}
