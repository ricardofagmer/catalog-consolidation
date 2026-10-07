import type { Type } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";
import { ReviewQueueModule } from "./review-queue/review-queue.module.js";
import { ReviewResolutionModule } from "./review-resolution/review-resolution.module.js";

// Feature modules are wired here by the orchestrator only; each owns its own directory.
export const FEATURE_MODULES: readonly Type<unknown>[] = [CatalogModule, ReviewQueueModule, ReviewResolutionModule];
