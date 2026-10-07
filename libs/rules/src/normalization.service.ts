// Match-key normalization (frozen rule B) and display cleanup (frozen rule C), ported from
// src/catalog_consolidation/domain/normalization.py.

import { Injectable } from "@nestjs/common";
import { TextService } from "./text.service.js";

// Python drops characters with a non-zero canonical combining class; JS exposes no combining
// class, so \p{M} is the accepted approximation (spec 5.2 step 1, decision Q5).
const COMBINING_MARK = /\p{M}/gu;
// casefold() expands sharp s to "ss" where toLowerCase() keeps it; capital sharp s (U+1E9E)
// lowercases to U+00DF first, so one replacement covers both.
const SHARP_S = /ß/gu;
// Quotes are deleted, not spaced: `Levi's` must collapse to `levis` to meet `Levis`.
const QUOTE = /["'’“”]/gu;
const NON_ALPHANUMERIC_RUN = /[^0-9a-z]+/gu;

@Injectable()
export class NormalizationService {
  constructor(private readonly text: TextService) {}

  /**
   * Return the comparison key for a name or brand, or null when nothing comparable remains.
   *
   * The step order is part of the contract, not a style choice: NFKD and the mark drop run before
   * lowercasing so `Câmera` loses its accent and meets `camera`; the sharp-s replacement then
   * supplies the only fold Python's casefold() adds over toLowerCase() that can land in [0-9a-z]
   * after NFKD. Quotes are deleted before the non-alphanumeric pass, so `55"` becomes `55` and
   * `Levi's` becomes `levis`; replacing them with a space first would split one word into two.
   */
  normalize(text: string | null): string | null {
    if (text === null) {
      return null;
    }
    const withoutMarks = text.normalize("NFKD").replace(COMBINING_MARK, "");
    const folded = withoutMarks.toLowerCase().replace(SHARP_S, "ss");
    const spaced = folded.replace(QUOTE, "").replace(NON_ALPHANUMERIC_RUN, " ");
    const key = this.text.pySplitJoin(spaced);
    return key === "" ? null : key;
  }

  /**
   * Collapse whitespace for the display value of a created product, or null when blank.
   *
   * Only whitespace changes: the seller's casing, accents and punctuation are what the catalog
   * shows, so they are kept verbatim.
   */
  cleanDisplay(text: string | null): string | null {
    if (text === null) {
      return null;
    }
    const cleaned = this.text.pySplitJoin(text);
    return cleaned === "" ? null : cleaned;
  }
}
