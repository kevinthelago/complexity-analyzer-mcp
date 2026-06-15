import type { Hotspot } from "../engine/hotspots/index.js";
import type { AnalyzableUnit } from "../engine/parser/types.js";
import type { StaticComplexityResult } from "../engine/static/types.js";
import type { SuggestResult } from "../engine/suggest/index.js";
import type { EmpiricalResult } from "../runtime/types.js";

const BIG_O_VALUES = [
  "O(1)",
  "O(log n)",
  "O(n)",
  "O(n log n)",
  "O(n²)",
  "O(n³)",
  "O(2ⁿ)",
  "unknown",
];

function buildHotspotsSection(hotspots: Hotspot[] | undefined): string {
  if (!hotspots || hotspots.length === 0) return "";
  const lines = hotspots.map(
    (h) =>
      `  - Line ${h.line}, col ${h.col}: ${h.reason}${h.uncertain ? " (uncertain)" : ""} — snippet: ${h.snippet.slice(0, 80)}`,
  );
  return `\nHotspots (costly constructs):\n${lines.join("\n")}`;
}

function buildSuggestionsSection(suggestions: SuggestResult | undefined): string {
  if (!suggestions || suggestions.suggestions.length === 0) return "";
  const lines = suggestions.suggestions.map(
    (s) =>
      `  - [${s.pattern}] Lines ${s.location.startLine}–${s.location.endLine}: ` +
      `${s.description} (${s.currentComplexity} → ${s.projectedComplexity})`,
  );
  return `\nStatic optimization suggestions:\n${lines.join("\n")}`;
}

function buildEmpiricalSection(empirical: EmpiricalResult | undefined): string {
  if (!empirical) return "";
  return (
    `\nEmpirical measurement: ${empirical.bigO} ` +
    `(R²=${empirical.rSquared.toFixed(3)}, confidence=${empirical.confidence}, ` +
    `reconciliation=${empirical.reconciliation})`
  );
}

/** Build the user-turn prompt sent to the LLM for deep complexity analysis. */
export function buildPrompt(
  unit: AnalyzableUnit,
  staticResult: StaticComplexityResult,
  hotspots?: Hotspot[],
  suggestions?: SuggestResult,
  empirical?: EmpiricalResult,
): string {
  const sourceCode = unit.node.getText();

  const uncertainSection =
    staticResult.uncertainNodes.length > 0
      ? `Uncertain constructs that need LLM refinement:\n${staticResult.uncertainNodes
          .map((n) => `  - Line ${n.line}, col ${n.col}: ${n.description}`)
          .join("\n")}`
      : "No uncertain constructs — static analysis was confident.";

  const recursionSection = staticResult.recursion
    ? `Recursion detected: ${staticResult.recursion.kind} — ${staticResult.recursion.rationale}`
    : "";

  const hotspotsSection = buildHotspotsSection(hotspots);
  const suggestionsSection = buildSuggestionsSection(suggestions);
  const empiricalSection = buildEmpiricalSection(empirical);

  return `You are a complexity analysis expert. Analyse the following TypeScript/JavaScript function and return a structured JSON verdict.

STATIC ANALYSIS RESULT:
- Function: ${unit.name}
- Time complexity: ${staticResult.timeComplexity} (confidence: ${staticResult.confidence})
- Space complexity: ${staticResult.spaceComplexity}
- ${uncertainSection}${recursionSection ? `\n- ${recursionSection}` : ""}${hotspotsSection}${suggestionsSection}${empiricalSection}

SOURCE CODE:
\`\`\`typescript
${sourceCode}
\`\`\`

INSTRUCTIONS:
1. Verify or correct the time and space Big-O estimates. Pay particular attention to the uncertain constructs listed above.
2. If hotspots or suggestions are listed, factor them into your analysis.
3. If an empirical measurement is provided, use it to validate or override the static estimate.
4. If a meaningfully more efficient alternative exists, provide it. Otherwise omit the "alternative" key entirely.

Respond with ONLY valid JSON — no markdown fences, no prose:
{
  "verifiedTimeComplexity": "<one of: ${BIG_O_VALUES.join(" | ")}>",
  "verifiedSpaceComplexity": "<one of: ${BIG_O_VALUES.join(" | ")}>",
  "rationale": "<1–3 sentences explaining the verdict>",
  "alternative": {
    "code": "<full function implementation>",
    "timeComplexity": "<Big-O>",
    "spaceComplexity": "<Big-O>",
    "rationale": "<1–2 sentences on why this is better>"
  }
}`;
}
