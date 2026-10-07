const SCORE_DECIMALS = 4;

/**
 * The API already rounds similarity half-to-even to 4 decimals, so the double is the nearest one to
 * a 4-decimal value and toFixed(4) prints exactly that value; this only pads trailing zeros.
 */
export function formatScore(similarity: number): string {
  return similarity.toFixed(SCORE_DECIMALS);
}
