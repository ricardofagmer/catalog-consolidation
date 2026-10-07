import type { ResolveCommand } from "@catalog/domain";

/** A resolve command, or link-candidate whose target is only known once the queue row is read. */
export type ResolutionRequest = { readonly kind: "link-candidate"; readonly reviewId: number } | ResolveCommand;
