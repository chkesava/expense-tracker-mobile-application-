/**
 * Test-only helpers for the SDK adapter contract tests (SPENDLY-635/636).
 * Node APIs only — never import this from app code.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

export const REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * Runtime (value) names imported from `adapterPath` by app (non-test) code,
 * with their files. Type-only imports are skipped: they never exist at
 * runtime, and type-checking always sees the web SDK's declarations.
 */
export function namesImportedFrom(adapterPath: string, adapterFile: string): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  const add = (name: string, file: string) => {
    const withoutComments = name.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!withoutComments || /^type\s/.test(withoutComments)) return;
    const clean = withoutComments.split(/\s+as\s+|\s*:\s*/)[0]?.trim();
    if (!clean) return;
    if (!used.has(clean)) used.set(clean, new Set());
    used.get(clean)!.add(file);
  };
  const escaped = adapterPath.replace(/[.*+?^${}()|[\]\\/]/g, (c) => "\\" + c);
  const staticImport = new RegExp(
    String.raw`import\s+\{([^{}]*)\}\s+from\s+["']` + escaped + `["']`,
    "g"
  );
  const dynamicImport = new RegExp(
    String.raw`\{([^{}]*)\}\s*=\s*await\s+import\(\s*["']` + escaped + String.raw`["']\s*\)`,
    "g"
  );
  const files = execSync(`git grep -l -e "${adapterPath}" -- "*.ts" "*.tsx"`, { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !/\.test\.tsx?$/.test(f) && f !== adapterFile);
  for (const file of files) {
    const src = readFileSync(path.join(REPO_ROOT, file), "utf8");
    for (const re of [staticImport, dynamicImport]) {
      for (const m of src.matchAll(re)) m[1]!.split(",").forEach((n) => add(n, file));
    }
  }
  return used;
}

/** Every export of `moduleName`'s package entry, resolved through its re-exports. */
export function moduleExports(moduleName: string): Set<string> {
  const probe = path.join(REPO_ROOT, `__contract_probe_${moduleName.replace(/\W/g, "_")}__.ts`);
  const host = ts.createCompilerHost({});
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (f) => (path.resolve(f) === probe ? `export * from "${moduleName}";` : readFile(f));
  host.fileExists = (f) => path.resolve(f) === probe || fileExists(f);
  const program = ts.createProgram(
    [probe],
    {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      skipLibCheck: true,
      noEmit: true,
      types: [],
    },
    host
  );
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(probe)!);
  return new Set(checker.getExportsOfModule(moduleSymbol!).map((s) => s.name));
}

/**
 * Names the app uses that the native SDK lacks, other than `allowed`
 * (name → the only files that may use it). Empty means the contract holds.
 */
export function contractProblems(
  used: Map<string, Set<string>>,
  native: Set<string>,
  allowed: Record<string, readonly string[]>
): string[] {
  const problems: string[] = [];
  for (const [name, files] of used) {
    if (native.has(name)) continue;
    const allowedIn = allowed[name];
    const outside = [...files].filter((f) => !allowedIn?.includes(f));
    if (!allowedIn || outside.length > 0) {
      problems.push(`${name} (${(outside.length ? outside : [...files]).join(", ")})`);
    }
  }
  return problems.sort();
}
