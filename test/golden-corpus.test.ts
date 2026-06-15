/**
 * Golden corpus regression gate for the static analysis engine.
 *
 * Each entry in corpus.json pins the expected Big-O output against a specific
 * KB version. A failure means either the engine regressed or the corpus needs
 * updating alongside a deliberate KB change.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KB_VERSION } from "../src/engine/cost-rules/index.js";
import { analyze } from "../src/engine/pipeline/index.js";

interface CorpusExpected {
  timeComplexity: string;
  spaceComplexity: string;
  confidence: "high" | "medium" | "low";
  uncertain?: boolean;
  recursionKind?: "linear" | "divide-and-conquer" | "exponential" | "uncertain";
  hotspots?: Array<{ bigO: string }>;
}

interface CorpusEntry {
  id: string;
  description: string;
  kbVersion: string;
  code: string;
  expected: CorpusExpected;
}

const corpus: CorpusEntry[] = JSON.parse(
  readFileSync(join(import.meta.dirname, "corpus/corpus.json"), "utf-8"),
);

describe("Golden corpus", () => {
  it("corpus entries are pinned against the current KB version", () => {
    const stale = corpus.filter((e) => e.kbVersion !== KB_VERSION);
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} corpus entry/entries pinned to old KB version.\n` +
          `Current KB: ${KB_VERSION}\n` +
          `Stale ids: ${stale.map((e) => e.id).join(", ")}`,
      );
    }
  });

  for (const entry of corpus) {
    it(`[${entry.id}] ${entry.description}`, () => {
      const result = analyze(entry.code, { filename: "input.ts" });

      expect(result.success, "analysis should succeed").toBe(true);
      expect(result.units.length, "at least one analyzable unit").toBeGreaterThan(0);

      const unit = result.units[0];
      if (!unit) throw new Error(`[${entry.id}] No units parsed`);

      expect(unit.timeComplexity, `[${entry.id}] time complexity`).toBe(
        entry.expected.timeComplexity,
      );
      expect(unit.spaceComplexity, `[${entry.id}] space complexity`).toBe(
        entry.expected.spaceComplexity,
      );
      expect(unit.confidence, `[${entry.id}] confidence`).toBe(entry.expected.confidence);

      if (entry.expected.uncertain === true) {
        expect(
          unit.uncertainNodes.length,
          `[${entry.id}] should have uncertain nodes`,
        ).toBeGreaterThan(0);
      } else if (entry.expected.uncertain === false) {
        expect(unit.uncertainNodes, `[${entry.id}] should have no uncertain nodes`).toHaveLength(0);
      }

      if (entry.expected.recursionKind) {
        expect(unit.recursion, `[${entry.id}] recursion info should exist`).toBeDefined();
        expect(unit.recursion?.kind, `[${entry.id}] recursion kind`).toBe(
          entry.expected.recursionKind,
        );
      }

      if (entry.expected.hotspots) {
        for (let i = 0; i < entry.expected.hotspots.length; i++) {
          const expected = entry.expected.hotspots[i];
          if (!expected) continue;
          expect(unit.hotspots[i]?.bigO, `[${entry.id}] hotspot[${i}] bigO`).toBe(expected.bigO);
        }
      }
    });
  }
});
