// ConsolidationResult, RunSummary, EntryOutcome and OutcomeCode live in @catalog/domain, as they did
// in core's domain/models.ts; only the types this library introduces are exported here.
export { ConsolidationModule } from "./consolidation.module.js";
export { ConsolidationService, type ConsolidationRequest } from "./consolidation.service.js";
