import {
  type ArrowFunction,
  ConstructorDeclaration,
  FunctionDeclaration,
  MethodDeclaration,
  Node,
  Project,
  ScriptTarget,
} from "ts-morph";
import type { AnalyzableUnit, ParseResult, UnitKind } from "./types.js";

export type { AnalyzableUnit, ParseError, ParseResult, UnitKind } from "./types.js";

/** Parse TypeScript/JavaScript source and enumerate analyzable units. */
export function parseCode(source: string, filename = "input.ts"): ParseResult {
  const isTs = filename.endsWith(".ts") || filename.endsWith(".tsx");

  let typeInfoAvailable = false;

  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        target: ScriptTarget.ES2022,
        allowJs: !isTs,
      },
    });

    const sourceFile = project.createSourceFile(filename, source);

    try {
      const diagnostics = sourceFile.getPreEmitDiagnostics();
      typeInfoAvailable = true;
      void diagnostics;
    } catch {
      typeInfoAvailable = false;
    }

    const units: AnalyzableUnit[] = [];

    function posOf(node: Node): { startLine: number; endLine: number } {
      return { startLine: node.getStartLineNumber(), endLine: node.getEndLineNumber() };
    }

    function nameOf(
      node: FunctionDeclaration | MethodDeclaration | ArrowFunction | ConstructorDeclaration,
    ): string {
      if (node instanceof FunctionDeclaration) return node.getName() ?? "<anonymous>";
      if (node instanceof MethodDeclaration) {
        const parent = node.getParent();
        const className =
          parent instanceof Node ? ((parent as { getName?: () => string }).getName?.() ?? "") : "";
        return className ? `${className}.${node.getName()}` : node.getName();
      }
      if (node instanceof ConstructorDeclaration) {
        const parent = node.getParent();
        const className =
          parent instanceof Node ? ((parent as { getName?: () => string }).getName?.() ?? "") : "";
        return className ? `${className}.constructor` : "constructor";
      }
      const parent = node.getParent();
      if (parent && Node.isVariableDeclaration(parent)) {
        return parent.getName();
      }
      return "<arrow>";
    }

    function addUnit(
      node: FunctionDeclaration | MethodDeclaration | ArrowFunction | ConstructorDeclaration,
      kind: UnitKind,
    ): void {
      const { startLine, endLine } = posOf(node);
      const unit: AnalyzableUnit = {
        kind,
        name: nameOf(node),
        startLine,
        endLine,
        node,
      };
      if (typeInfoAvailable) {
        try {
          if (node instanceof FunctionDeclaration || node instanceof MethodDeclaration) {
            unit.returnType = node.getReturnType();
          }
        } catch {
          // type info unavailable for this node
        }
      }
      units.push(unit);
    }

    sourceFile.forEachDescendant((node) => {
      if (Node.isFunctionDeclaration(node)) {
        addUnit(node, "function");
      } else if (Node.isMethodDeclaration(node)) {
        addUnit(node, "method");
      } else if (Node.isArrowFunction(node)) {
        addUnit(node, "arrow");
      } else if (Node.isConstructorDeclaration(node)) {
        addUnit(node, "constructor");
      }
    });

    return { success: true, units, typeInfoAvailable };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      parseError: { message },
      units: [],
      typeInfoAvailable: false,
    };
  }
}

/** Map a ts-morph node to its 1-based {line, col} position. */
export function nodePosition(node: Node): { line: number; col: number } {
  const line = node.getStartLineNumber();
  const lineStarts = node.getSourceFile().compilerNode.getLineStarts();
  const lineStart = lineStarts[line - 1] ?? 0;
  const col = node.getStart() - lineStart + 1;
  return { line, col };
}
