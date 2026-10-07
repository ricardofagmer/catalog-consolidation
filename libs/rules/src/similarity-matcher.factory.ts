import { Injectable, Scope } from "@nestjs/common";
import { SequenceMatcher } from "./sequence-matcher.js";

// A SequenceMatcher caches per-comparison state (b2j, matching blocks), so it is never shared:
// every comparison gets a fresh instance from this factory.
@Injectable({ scope: Scope.TRANSIENT })
export class SimilarityMatcherFactory {
  create(a: string, b: string): SequenceMatcher {
    return new SequenceMatcher(a, b);
  }
}
