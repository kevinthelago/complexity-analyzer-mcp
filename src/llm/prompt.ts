import type { AnalyzableUnit } from "../engine/parser/types.js";
import type { StaticComplexityResult } from "../engine/static/types.js";

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

/** Build the user-turn prompt sent to the LLM for deep complexity analysis. */
export function buildPrompt(unit: AnalyzableUnit, staticResult: StaticComplexityResult): string {
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

  return `You are a complexity analysis expert. Analyse the following TypeScript/JavaScript function and return a structured JSON verdict.

STATIC ANALYSIS RESULT:
- Function: ${unit.name}
- Time complexity: ${staticResult.timeComplexity} (confidence: ${staticResult.confidence})
- Space complexity: ${staticResult.spaceComplexity}
- ${uncertainSection}${recursionSection ? `\n- ${recursionSection}` : ""}

SOURCE CODE:
\`\`\`typescript
${sourceCode}
\`\`\`

INSTRUCTIONS:
1. Verify or correct the time and space Big-O estimates. Pay particular attention to the uncertain constructs listed above.
2. If a meaningfully more efficient alternative exists, provide it. Otherwise omit the "alternative" key entirely.

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
