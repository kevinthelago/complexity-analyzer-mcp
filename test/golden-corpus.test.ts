import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KB_VERSION } from "../src/engine/cost-rules/index.js";
import { analyze } from "../src/engine/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(__dirname, "corpus");

type CorpusUnit = {
  name: string;
  time: string;
  space: string;
  hotspotCount?: number;
};

type CorpusEntry = {
  name: string;
  kbVersion: string;
  lang?: string;
  snippet: string;
  units: CorpusUnit[];
};

const entries: Array<{ file: string; entry: CorpusEntry }> = readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({
    file: f,
    entry: JSON.parse(readFileSync(join(CORPUS_DIR, f), "utf-8")) as CorpusEntry,
  }));

/** Returns true once engine-spine has provided a real parser implementation. */
function engineSpineAvailable(): boolean {
  try {
    analyze("function f(){}", { lang: "typescript" });
    return true;
  } catch (e) {
    if (e instanceof Error && e.message.includes("engine-spine")) return false;
    throw e; // unexpected error — let it surface
  }
}

const engineReady = engineSpineAvailable();

describe("Golden corpus regression", () => {
  describe("KB version guard", () => {
    for (const { file, entry } of entries) {
      it(`${file} pins current KB version`, () => {
        expect(
          entry.kbVersion,
          `${file}: update kbVersion to "${KB_VERSION}" after reviewing expected values`,
        ).toBe(KB_VERSION);
      });
    }
  });

  describe.skipIf(!engineReady)("Complexity assertions (requires engine-spine)", () => {
    for (const { file, entry } of entries) {
      describe(entry.name, () => {
        it("matches expected complexity per unit", () => {
          const lang = (entry.lang as "typescript" | "javascript") ?? "typescript";
          const result = analyze(entry.snippet, { lang });

          expect(result.parseError, `${file}: unexpected parse error`).toBeUndefined();

          expect(result.units, `${file}: unit count mismatch`).toHaveLength(entry.units.length);

          for (const [i, expected] of entry.units.entries()) {
            const actual = result.units[i];
            expect(actual, `${file}: unit[${i}] missing`).toBeDefined();

            expect(actual?.time, `${file} unit[${i}] (${expected.name}): time`).toBe(expected.time);

            expect(actual?.space, `${file} unit[${i}] (${expected.name}): space`).toBe(
              expected.space,
            );

            if (expected.hotspotCount !== undefined) {
              expect(
                actual?.hotspots.length,
                `${file} unit[${i}] (${expected.name}): hotspot count`,
              ).toBe(expected.hotspotCount);
            }
          }
        });

        it("produces no parse error", () => {
          const lang = (entry.lang as "typescript" | "javascript") ?? "typescript";
          const result = analyze(entry.snippet, { lang });
          expect(result.parseError).toBeUndefined();
        });
      });
    }
  });
});
