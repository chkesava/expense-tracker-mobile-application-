import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-635 — app code imports Firestore only from `@/lib/firestore`, and
 * every name it imports must exist in `@react-native-firebase/firestore`'s
 * modular API too, so SPENDLY-638 can map native onto it without surprises.
 *
 * The only names the native SDK lacks are the JS SDK's cache-setup helpers;
 * they are allowed solely in `lib/firebase.ts`, which SPENDLY-638 splits per
 * platform (native configures persistence through `initializeFirestore`).
 */

const ROOT = path.resolve(__dirname, "..");

const JS_ONLY_CACHE_SETUP: Record<string, readonly string[]> = {
  memoryLocalCache: ["lib/firebase.ts"],
  persistentLocalCache: ["lib/firebase.ts"],
  persistentMultipleTabManager: ["lib/firebase.ts"],
  persistentSingleTabManager: ["lib/firebase.ts"],
};

function trackedSources(pattern: string): string[] {
  return execSync(`git grep -l -e "${pattern}" -- "*.ts" "*.tsx"`, { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/** Names imported from `@/lib/firestore` by app (non-test) code, with their files. */
function namesUsedByApp(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  const add = (name: string, file: string) => {
    const clean = name.trim().replace(/^type\s+/, "").split(/\s+as\s+|\s*:\s*/)[0]?.trim();
    if (!clean) return;
    if (!used.has(clean)) used.set(clean, new Set());
    used.get(clean)!.add(file);
  };
  const files = trackedSources("@/lib/firestore").filter(
    (f) => !/\.test\.tsx?$/.test(f) && f !== "lib/firestore.ts"
  );
  for (const file of files) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^{}]*)\}\s+from\s+["']@\/lib\/firestore["']/g)) {
      m[1]!.split(",").forEach((n) => add(n, file));
    }
    for (const m of src.matchAll(/\{([^{}]*)\}\s*=\s*await\s+import\(\s*["']@\/lib\/firestore["']\s*\)/g)) {
      m[1]!.split(",").forEach((n) => add(n, file));
    }
  }
  return used;
}

/** Every export of the native SDK's package entry, resolved through its re-exports. */
function nativeExports(): Set<string> {
  const probe = path.join(ROOT, "__rnfb_contract_probe__.ts");
  const host = ts.createCompilerHost({});
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (f) =>
    path.resolve(f) === probe ? 'export * from "@react-native-firebase/firestore";' : readFile(f);
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

describe("Firestore adapter contract (SPENDLY-635)", () => {
  it("every Firestore name the app uses exists in the native SDK", () => {
    const native = nativeExports();
    expect(native.size).toBeGreaterThan(50);

    const problems: string[] = [];
    for (const [name, files] of namesUsedByApp()) {
      if (native.has(name)) continue;
      const allowedIn = JS_ONLY_CACHE_SETUP[name];
      const outside = [...files].filter((f) => !allowedIn?.includes(f));
      if (!allowedIn || outside.length > 0) {
        problems.push(`${name} (${outside.join(", ") || [...files].join(", ")})`);
      }
    }
    expect(problems).toEqual([]);
  }, 60_000);
});
