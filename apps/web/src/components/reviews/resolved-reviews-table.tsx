import type { ReactNode } from "react";
import type { ReviewItem, ReviewStatus } from "@catalog/api-client";
import { formatScore } from "../../lib/format-score";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ReasonBadge } from "./reason-badge";

// Same columns as `review list` in the CLI.
const COLUMNS = ["Id", "SellerName", "SellerProductId", "Reason", "Score", "CandidateProductId", "SourceName"];

/** Resolved reviews have no actions left, so they are listed as rows rather than cards. */
export function ResolvedReviewsTable({
  status,
  items,
}: {
  readonly status: ReviewStatus;
  readonly items: readonly ReviewItem[];
}): ReactNode {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-xs">
      <Table>
        <TableCaption className="px-3 pt-3">{`${status} reviews`}</TableCaption>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column} scope="col">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.id}</TableCell>
              <TableCell>{item.sellerName}</TableCell>
              <TableCell className="font-mono">{item.sellerProductId}</TableCell>
              <TableCell>
                <ReasonBadge reason={item.reason} />
              </TableCell>
              <TableCell className="tabular-nums">{item.similarity === null ? "" : formatScore(item.similarity)}</TableCell>
              <TableCell>{item.candidateProductId ?? ""}</TableCell>
              <TableCell>{item.sourceName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
