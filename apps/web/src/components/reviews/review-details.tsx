import type { ReactNode } from "react";
import type { CandidateProduct, ReviewItem } from "@catalog/api-client";
import { formatScore } from "../../lib/format-score";

const SECTION_CLASS_NAME = "flex flex-col gap-2 rounded-md border p-3";
const SECTION_HEADING_CLASS_NAME = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/** What the seller sent, exactly as received. */
export function SellerEntry({ headingId, item }: { readonly headingId: string; readonly item: ReviewItem }): ReactNode {
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS_NAME}>
      <h3 id={headingId} className={SECTION_HEADING_CLASS_NAME}>
        Seller entry
      </h3>
      <DetailList
        rows={[
          ["SourceName", item.sourceName],
          ["SourceBrand", item.sourceBrand],
          ["SourceCategory", item.sourceCategory],
          ["Seller", item.sellerName],
          ["SKU", item.sellerProductId],
        ]}
      />
    </section>
  );
}

/** What the matcher proposed: the stored candidate, or for AMBIGUOUS items the products it would see now. */
export function CandidateDetails({
  headingId,
  item,
}: {
  readonly headingId: string;
  readonly item: ReviewItem;
}): ReactNode {
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS_NAME}>
      {item.reason === "AMBIGUOUS" ? (
        <LiveCandidates headingId={headingId} candidates={item.liveCandidates} />
      ) : (
        <StoredCandidate headingId={headingId} item={item} />
      )}
    </section>
  );
}

function StoredCandidate({ headingId, item }: { readonly headingId: string; readonly item: ReviewItem }): ReactNode {
  const { candidate, candidateProductId, similarity } = item;
  return (
    <>
      <h3 id={headingId} className={SECTION_HEADING_CLASS_NAME}>
        Candidate product
      </h3>
      {candidate === null ? (
        <p className="text-muted-foreground">
          {candidateProductId === null
            ? "No candidate product."
            : `Product ${String(candidateProductId)} no longer exists.`}
        </p>
      ) : (
        <DetailList
          rows={[
            ["Id", String(candidate.id)],
            ["Name", candidate.name],
            ["Brand", candidate.brand],
            ["Category", candidate.category],
            ["Score", similarity === null ? null : formatScore(similarity)],
          ]}
        />
      )}
    </>
  );
}

// AMBIGUOUS rows persist no candidate id, so the card shows what the matcher would see now.
function LiveCandidates({
  headingId,
  candidates,
}: {
  readonly headingId: string;
  readonly candidates: readonly CandidateProduct[];
}): ReactNode {
  return (
    <>
      <h3 id={headingId} className={SECTION_HEADING_CLASS_NAME}>
        Live candidates
      </h3>
      {candidates.length === 0 ? (
        <p className="text-muted-foreground">No catalog product matches this entry now.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="break-words">
              <span className="font-mono">#{candidate.id}</span> {candidate.name}
              <span className="text-muted-foreground">
                {" "}
                ({candidate.brand ?? "no brand"}, {candidate.category ?? "no category"})
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function DetailList({ rows }: { readonly rows: readonly (readonly [string, string | null])[] }): ReactNode {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value ?? <span className="text-muted-foreground">none</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
