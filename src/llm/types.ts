import type { Hotspot } from "../engine/hotspots/index.js";
import type { AnalyzableUnit } from "../engine/parser/types.js";
import type { StaticComplexityResult } from "../engine/static/types.js";
import type { SuggestionResult } from "../engine/suggest/index.js";
import type { EmpiricalResult } from "../runtime/types.js";

export type LLMStatus = "ok" | "llm_unavailable" | "llm_error";

/** A proposed alternative implementation with its complexity claims (unverified). */
export interface LLMAlternative {
  code: string;
  timeComplexity: string;
  /** Always false in v1 — the proposed code is never re-analysed by the static engine. */
  timeComplexityVerified: false;
  spaceComplexity: string;
  rationale: string;
}

/** The static result enriched with LLM refinement. Never throws; check llmStatus first. */
export interface DeepAnalyzeResult extends StaticComplexityResult {
  llmStatus: LLMStatus;
  /** LLM-verified time complexity (may differ from static estimate). */
  verifiedTimeComplexity?: string;
  /** LLM-verified space complexity. */
  verifiedSpaceComplexity?: string;
  /** LLM rationale explaining the complexity verdict. */
  llmRationale?: string;
  /** Optional more-efficient alternative proposed by the LLM. */
  alternative?: LLMAlternative;
}

export interface DeepAnalyzeInput {
  unit: AnalyzableUnit;
  staticResult: StaticComplexityResult;
  /** Pre-computed hotspots; passed through to the prompt when provided. */
  hotspots?: Hotspot[];
  /** Pre-computed optimization suggestions; included in the prompt when provided. */
  suggestions?: SuggestionResult;
  /** Empirical timing result from the runtime sandbox; included when available. */
  empirical?: EmpiricalResult;
}

/**
 * Injectable LLM client interface.
 * The real implementation wraps the Anthropic SDK; tests inject a mock.
 */
export interface LLMClient {
  complete(prompt: string): Promise<string>;
}
