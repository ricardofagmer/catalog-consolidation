// Accessible names for the controls each review card repeats. Each name starts with the button's
// visible label (WCAG 2.5.3 label in name, so voice control users can say what they see) and then
// names the review and the target. Product names are shortened so a long catalog name cannot turn a
// button name into a paragraph; React escapes the text, so nothing here is HTML.

const NAME_MAX_CODE_POINTS = 48;
const ELLIPSIS = "…";

function shortName(text: string): string {
  const codePoints = [...text.replace(/\s+/g, " ").trim()];
  return codePoints.length <= NAME_MAX_CODE_POINTS
    ? codePoints.join("")
    : `${codePoints.slice(0, NAME_MAX_CODE_POINTS - 1).join("").trimEnd()}${ELLIPSIS}`;
}

export function linkCandidateName(args: {
  readonly reviewId: number;
  readonly productId: number;
  readonly productName: string | null;
}): string {
  const product = args.productName === null ? "" : ` (${shortName(args.productName)})`;
  return `Link to candidate product ${String(args.productId)}${product} for review ${String(args.reviewId)}`;
}

export function linkLiveCandidateName(args: {
  readonly reviewId: number;
  readonly productId: number;
  readonly productName: string;
}): string {
  return `Link to product ${String(args.productId)} (${shortName(args.productName)}) for review ${String(args.reviewId)}`;
}

export function linkOtherName(reviewId: number): string {
  return `Link to another product for review ${String(reviewId)}`;
}

export function createProductName(reviewId: number): string {
  return `Create new product for review ${String(reviewId)}`;
}

export function rejectName(reviewId: number): string {
  return `Reject review ${String(reviewId)}`;
}
