# complexity-analyzer-mcp

An MCP server that analyses TypeScript and JavaScript code for time and space complexity.
Three static tools are always available; a fourth (`deep_analyze`) uses an LLM for a
second-opinion pass and requires `ANTHROPIC_API_KEY`.

## Quick start

### Wire the server into your MCP host

Add the following to your host's MCP configuration (e.g. `.mcp.json` for Claude Desktop
or the equivalent for your editor):

```json
{
  "mcpServers": {
    "complexity-analyzer": {
      "command": "npx",
      "args": ["complexity-analyzer-mcp"]
    }
  }
}
```

Or, if you have the package installed globally or locally:

```json
{
  "mcpServers": {
    "complexity-analyzer": {
      "command": "node",
      "args": ["./node_modules/.bin/complexity-mcp"]
    }
  }
}
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Only for `deep_analyze` | Anthropic API key used by the LLM pass |
| `COMPLEXITY_MODEL` | No | Override the Anthropic model (default: `claude-haiku-4-5-20251001`) |

## MCP tools

### `analyze_complexity`

Static Big-O analysis — parses the source, extracts every function/method, and returns
time complexity, space complexity, and a confidence rating.

**Input**

```json
{
  "code": "function sum(a: number[], b: number[]): number[] { ... }",
  "filename": "math.ts"
}
```

`filename` is optional (default `input.ts`) and is used only for language detection
(`.ts` → TypeScript mode, `.js` → JavaScript mode).

**Output** (example)

```json
{
  "file": "math.ts",
  "units": [
    {
      "kind": "function",
      "name": "sum",
      "startLine": 1,
      "endLine": 1,
      "timeComplexity": "O(n)",
      "spaceComplexity": "O(n)",
      "confidence": "high",
      "uncertainNodes": []
    }
  ]
}
```

---

### `suggest_optimizations`

Static pattern scanner that detects common algorithmic anti-patterns and suggests
data-structure or complexity improvements.

**Detected patterns**

| Pattern | Signal | Suggestion |
|---|---|---|
| `membership-in-loop` | `Array.includes` / `.indexOf` / `.find` inside a loop | Replace with a `Set` for O(1) lookups |
| `sort-in-loop` | `Array.sort()` inside a loop | Hoist the sort before the loop |
| `unshift-splice-in-loop` | `.unshift()` / `.splice(0,…)` inside a loop | Collect with `.push()` then `.reverse()` once |
| `recompute-in-recursion` | Exponential recursion without memoization | Add a `Map`-based memo cache |
| `nested-scan` | Two nested loops with no `Set`/`Map` lookup | Pre-build a `Set` from the inner collection |

**Input** — same shape as `analyze_complexity`.

**Output** (example)

```json
{
  "suggestions": [
    {
      "functionName": "findCommon",
      "pattern": "membership-in-loop",
      "description": "Array.includes() inside a loop causes O(n²) behaviour — build a Set once before the loop for O(1) lookups.",
      "rationale": "Array linear-search methods are O(n). Calling one inside an O(n) loop yields O(n²).",
      "currentComplexity": "O(n²)",
      "projectedComplexity": "O(n)",
      "location": { "startLine": 3, "endLine": 7 }
    }
  ],
  "summary": "Found 1 optimization opportunity."
}
```

---

### `find_hotspots`

**Not yet available in this build.** Will identify the highest-complexity functions ranked
by Big-O cost once the hotspot analyzer (CA-5) lands.

---

### `deep_analyze`

LLM-powered verification pass on top of the static analysis. Requires `ANTHROPIC_API_KEY`.

Calls `analyze_complexity` internally, then sends each result to an LLM for verification.
The LLM may correct the complexity estimate, explain the reasoning, and propose a
more-efficient alternative implementation.

**Input** — same shape as `analyze_complexity`.

**Output** (example)

```json
[
  {
    "timeComplexity": "O(2ⁿ)",
    "spaceComplexity": "O(n)",
    "confidence": "high",
    "uncertainNodes": [],
    "recursion": { "kind": "exponential", "rationale": "Two recursive calls without halving" },
    "llmStatus": "ok",
    "verifiedTimeComplexity": "O(2ⁿ)",
    "verifiedSpaceComplexity": "O(n)",
    "llmRationale": "Each call to fib(n) spawns two sub-calls; without memoization this doubles the work at every level.",
    "alternative": {
      "code": "function fib(n: number, cache = new Map<number, number>()): number { ... }",
      "timeComplexity": "O(n)",
      "timeComplexityVerified": false,
      "spaceComplexity": "O(n)",
      "rationale": "Memoizing results in a Map reduces unique sub-problems from 2ⁿ to n."
    }
  }
]
```

When `ANTHROPIC_API_KEY` is absent, `llmStatus` is `"llm_unavailable"` and the LLM fields
are omitted — static results are always returned.

## CLI

The package also ships a `complexity-analyzer` CLI for one-shot analysis of a file:

```
complexity-analyzer analyze <path> [options]

Options:
  --json        Emit raw JSON output
  --deep        Run LLM-powered deep analysis (requires ANTHROPIC_API_KEY)
  --lang <ext>  Override language detection (ts | js)
  -h, --help    Show this help
```

**Examples**

```sh
# Human-readable output
complexity-analyzer analyze src/utils.ts

# JSON output (pipe-friendly)
complexity-analyzer analyze src/utils.ts --json

# Deep analysis with LLM verification
ANTHROPIC_API_KEY=sk-... complexity-analyzer analyze src/utils.ts --deep
```

## Language support

TypeScript and JavaScript are fully supported today. Additional languages are
planned for a future release.

## Development

```sh
pnpm install
pnpm check       # biome lint + format check
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm ci          # full gate: check + typecheck + test
```
