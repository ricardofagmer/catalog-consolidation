import { Module } from "@nestjs/common";
import { MatchingService } from "./matching.service.js";
import { NormalizationService } from "./normalization.service.js";
import { SimilarityMatcherFactory } from "./similarity-matcher.factory.js";
import { TextService } from "./text.service.js";

const RULE_PROVIDERS = [TextService, NormalizationService, SimilarityMatcherFactory, MatchingService];

// Nest reads a module entirely from its decorator metadata, so the class body is empty by design.
@Module({ providers: RULE_PROVIDERS, exports: RULE_PROVIDERS })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class RulesModule {}
