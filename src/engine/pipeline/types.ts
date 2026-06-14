export type Stage = "static" | "hotspots" | "llm" | "suggest";

export type PipelineOptions = {
  lang?: "typescript" | "javascript";
  /**
   * Which stages to run. Defaults to ["static", "hotspots"].
   * "llm" requires an LLM provider (Phase 3). "suggest" requires the suggestion
   * generator (CA-9). Omitting a stage produces empty/default values for its fields.
   */
  stages?: Stage[];
};
