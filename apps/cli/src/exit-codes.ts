// Frozen exit-code table (spec section 7): scripts and the parity check branch on these values.
export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_INVALID_INPUT = 2;

export type ExitCode = typeof EXIT_OK | typeof EXIT_FAILURE | typeof EXIT_INVALID_INPUT;
