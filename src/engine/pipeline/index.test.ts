import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedSource, StaticPassResult } from "../schema/internal.js";
import { analyze } from "./index.js";

vi.mock("../parser/index.js", () => ({
  parse: vi.fn(),
  parseFile: vi.fn(),
}));

vi.mock("../static/index.js", () => ({
  staticPass: vi.fn(),
}));

vi.mock("../cost-rules/index.js", () => ({
  KB_VERSION: "1.0.0",
  lookupCost: vi.fn(),
}));

import { parse } from "../parser/index.js";
import { staticPass } from "../static/index.js";

const mockParse = vi.mocked(parse);
const mockStaticPass = vi.mocked(staticPass);

const goodSource: ParsedSource = {
  units: [{ name: "sum", line: 1, column: 0, source: "function sum(...){}" }],
  typeInfoAvailable: true,
  lang: "typescript",
};

const staticResult: StaticPassResult = {
  time: "O(n)",
  space: "O(1)",
  confidence: "high",
  perNodeCosts: [
    {
      line: 3,
      column: 2,
      snippet: "for (const x of arr)",
      timeCost: "O(n)",
      spaceCost: "O(1)",
      reason: "Iterates arr once",
    },
  ],
  uncertainNodes: [],
};

beforeEach(() => {
  mockParse.mockReturnValue(goodSource);
  mockStaticPass.mockReturnValue(staticResult);
});

describe("analyze pipeline", () => {
  it("returns a schema-validated result for a normal unit", () => {
    const result = analyze("function sum(){}", { lang: "typescript" });

    expect(result.parseError).toBeUndefined();
    expect(result.units).toHaveLength(1);
    const unit = result.units[0];
    expect(unit?.name).toBe("sum");
    expect(unit?.time).toBe("O(n)");
    expect(unit?.space).toBe("O(1)");
    expect(unit?.analyzedBy).toBe("static");
    expect(unit?.hotspots).toHaveLength(1);
    expect(result.metadata.kbVersion).toBe("1.0.0");
    expect(result.metadata.lang).toBe("typescript");
  });

  it("returns well-formed result on parseError, does not throw", () => {
    mockParse.mockReturnValue({
      units: [],
      parseError: { message: "Unexpected token", line: 1, column: 5 },
      typeInfoAvailable: false,
      lang: "typescript",
    });

    const result = analyze("function !(", { lang: "typescript" });

    expect(result.parseError).toMatchObject({ message: "Unexpected token" });
    expect(result.units).toHaveLength(0);
    expect(result.notes).toEqual([]);
  });

  it("notes no-analyzable-units without throwing", () => {
    mockParse.mockReturnValue({
      units: [],
      typeInfoAvailable: true,
      lang: "typescript",
    });

    const result = analyze("const x = 1;");

    expect(result.units).toHaveLength(0);
    expect(result.notes).toContain("No analyzable units found in source");
  });

  it("skips hotspots when stage is omitted", () => {
    const result = analyze("function sum(){}", { stages: ["static"] });

    expect(result.units[0]?.hotspots).toHaveLength(0);
  });

  it("skips static pass entirely when not in stages, producing empty units", () => {
    const result = analyze("function sum(){}", { stages: ["hotspots"] });

    expect(result.units).toHaveLength(0);
  });

  it("identical input produces identical analysis fields (statelessness)", () => {
    const a = analyze("function f(){}");
    const b = analyze("function f(){}");

    expect(a.units).toEqual(b.units);
    expect(a.parseError).toEqual(b.parseError);
    expect(a.notes).toEqual(b.notes);
    expect(a.metadata.lang).toBe(b.metadata.lang);
    expect(a.metadata.kbVersion).toBe(b.metadata.kbVersion);
    // metadata.analyzedAt may differ by a few ms — excluded from statelessness check
  });

  it("passes typeInfoAvailable from parsed source to staticPass", () => {
    analyze("function f(){}");
    expect(mockStaticPass).toHaveBeenCalledWith(expect.objectContaining({ name: "sum" }), {
      typeInfoAvailable: true,
    });
  });
});
