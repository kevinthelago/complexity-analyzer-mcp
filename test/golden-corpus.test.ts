/**
 * Golden corpus regression gate for the static complexity analyzer.
 *
 * Auto-discovers all entries in test/corpus/index.ts and runs each
 * through: parse → analyzeUnit → findHotspots.
 *
 * Failures display an expected-vs-actual diff via vitest's `toMatchObject`.
 * This file is included in the vitest run and forms part of the CI gate.
 */

import { describe, expect, it } from "vitest";
import { KB_VERSION } from "../src/engine/cost-rules/index.js";
import { findHotspots } from "../src/engine/hotspots/index.js";
import { parseCode } from "../src/engine/parser/index.js";
import { analyzeUnit } from "../src/engine/static/index.js";
import { CORPUS, KB_VERSION_PINNED } from "./corpus/index.js";

// ── KB version pin ────────────────────────────────────────────────────────────

it("corpus KB version matches the cost-rules KB_VERSION", () => {
  expect(KB_VERSION).toBe(KB_VERSION_PINNED);
});

// ── Per-entry harness ────────────────────────────────────────────────────────

describe("golden corpus", () => {
  for (const entry of CORPUS) {
    it(`[${entry.id}] ${entry.description}`, () => {
      // 1. Parse
      const parsed = parseCode(entry.snippet, "corpus.ts");
      expect(parsed.success, `Parse failed for ${entry.id}`).toBe(true);
      expect(parsed.units.length, `No analyzable units found in ${entry.id}`).toBeGreaterThan(0);

      const unit = parsed.units[0];
      if (!unit) throw new Error(`[${entry.id}] No unit parsed`);

      // 2. Static pass
      const result = analyzeUnit(unit);

      // 3. Assert expected time + space complexity
      expect(
        { timeComplexity: result.timeComplexity, spaceComplexity: result.spaceComplexity },
        `[${entry.id}] complexity mismatch`,
      ).toMatchObject({
        timeComplexity: entry.expected.timeComplexity,
        spaceComplexity: entry.expected.spaceComplexity,
      });

      // 4. Assert confidence (when specified)
      if (entry.expected.confidence !== undefined) {
        expect(result.confidence, `[${entry.id}] confidence mismatch`).toBe(
          entry.expected.confidence,
        );
      }

      // 5. Assert uncertainty (when expected)
      if (entry.expected.uncertainExpected) {
        expect(
          result.uncertainNodes.length,
          `[${entry.id}] expected uncertain nodes but found none`,
        ).toBeGreaterThan(0);
      }

      // 6. Hotspot assertions (when provided)
      if (entry.expected.hotspots !== undefined) {
        const hotspots = findHotspots(unit, result);

        if (entry.expected.hotspots.length === 0) {
          expect(hotspots, `[${entry.id}] expected no hotspots`).toHaveLength(0);
        } else {
          for (const expected of entry.expected.hotspots) {
            expect(
              hotspots.some((h) => h.bigO === expected.bigO),
              `[${entry.id}] no hotspot with bigO=${expected.bigO} found; got [${hotspots.map((h) => h.bigO).join(", ")}]`,
            ).toBe(true);
          }
        }
      }
    });
  }
});
