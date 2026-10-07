import { Injectable } from "@nestjs/common";
import {
  FUZZY_REVIEW_THRESHOLD,
  type BrandCheck,
  type CatalogProduct,
  type CatalogReader,
  type CreateDecision,
  type HoldDecision,
  type LinkDecision,
  type MatchDecision,
  type MatchQuery,
} from "@catalog/domain";
import { SimilarityMatcherFactory } from "./similarity-matcher.factory.js";

@Injectable()
export class MatchingService {
  constructor(private readonly matcherFactory: SimilarityMatcherFactory) {}

  /** Decide link / hold / create for one entry (ADR 0002, frozen rule B). */
  matchEntry(args: { query: MatchQuery; catalog: CatalogReader }): MatchDecision {
    const { query, catalog } = args;
    const candidates = catalog.findByNormalizedName({
      normalizedName: query.normalizedName,
      normalizedBrand: query.normalizedBrand,
    });
    const [onlyCandidate] = candidates;
    if (candidates.length === 1 && onlyCandidate !== undefined) {
      return linkExactKey({ query, candidate: onlyCandidate });
    }
    if (candidates.length > 1) {
      return {
        kind: "hold",
        reason: "AMBIGUOUS",
        candidateProductId: null,
        score: null,
        candidateProductIds: candidates.map((product) => product.id).toSorted((x, y) => x - y),
      };
    }
    return this.decideBySimilarity({ query, catalog });
  }

  private decideBySimilarity(args: { query: MatchQuery; catalog: CatalogReader }): HoldDecision | CreateDecision {
    const { query, catalog } = args;
    // Fuzzy similarity only ever holds for review, never links (frozen rule B).
    const matcher = this.matcherFactory.create(query.normalizedName, "");
    let bestId: number | null = null;
    let bestRatio = 0;
    for (const candidate of catalog.listBrandCompatible({ normalizedBrand: query.normalizedBrand })) {
      matcher.setSeq2(candidate.normalizedName);
      // quickRatio/realQuickRatio are upper bounds of ratio, so skipping on a strictly lower bound
      // cannot change the winner (ties still reach the full ratio).
      if (bestId !== null && (matcher.realQuickRatio() < bestRatio || matcher.quickRatio() < bestRatio)) {
        continue;
      }
      const ratio = matcher.ratio();
      if (beatsBest({ ratio, productId: candidate.productId, bestRatio, bestId })) {
        bestId = candidate.productId;
        bestRatio = ratio;
      }
    }
    if (bestId === null) {
      return { kind: "create", bestScore: null };
    }
    if (bestRatio >= FUZZY_REVIEW_THRESHOLD) {
      return {
        kind: "hold",
        reason: "FUZZY",
        candidateProductId: bestId,
        score: bestRatio,
        candidateProductIds: [bestId],
      };
    }
    return { kind: "create", bestScore: bestRatio };
  }
}

function linkExactKey(args: { query: MatchQuery; candidate: CatalogProduct }): LinkDecision {
  const { query, candidate } = args;
  return {
    kind: "link",
    productId: candidate.id,
    matchType: candidate.name === query.rawName ? "EXACT" : "NORMALIZED",
    brandCheck: brandCheckOf({ entryBrand: query.normalizedBrand, candidateBrand: candidate.normalizedBrand }),
  };
}

function brandCheckOf(args: { entryBrand: string | null; candidateBrand: string | null }): BrandCheck {
  const { entryBrand, candidateBrand } = args;
  if (entryBrand === null && candidateBrand === null) {
    return "both_null";
  }
  if (entryBrand === null || candidateBrand === null) {
    return "one_side_null";
  }
  return "matched";
}

function beatsBest(args: { ratio: number; productId: number; bestRatio: number; bestId: number | null }): boolean {
  const { ratio, productId, bestRatio, bestId } = args;
  // Ties go to the lowest id, independent of the order the reader yields in.
  if (bestId === null || ratio > bestRatio) {
    return true;
  }
  return ratio === bestRatio && productId < bestId;
}
