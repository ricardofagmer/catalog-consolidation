// The button and input primitives set `outline-none` and focus with a 50% ring, which blends to
// under 3:1 against the card. This restores the solid token outline (>= 6:1) on review controls;
// `outline-solid` is needed because `outline-none` also clears Tailwind's outline-style variable.
export const FOCUS_RING_CLASS_NAME =
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
