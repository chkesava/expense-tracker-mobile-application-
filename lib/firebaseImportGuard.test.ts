import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SPENDLY-635/636/637 — Firestore, Auth and Storage are imported through
 * `@/lib/firestore`, `@/lib/auth` and `@/lib/storage` only, so the native build swaps in @react-native-firebase
 * in one place (SPENDLY-638). A direct `firebase/firestore` or
 * `firebase/auth` import would silently keep that module on the JS SDK: the
 * memory-only cache, and a signed-in user the native rules never see.
 *
 * Allowed: the adapters themselves, the rules tests and Node scripts (they
 * drive the emulator with the web SDK), and `vi.mock("firebase/…", …)` in
 * tests (the adapters re-export those modules, so the mock still applies).
 */

const ROOT = path.resolve(__dirname, "..");
const ALLOWED_DIRS = ["firestore/", "scripts/"];

const GUARDED = [
  { module: "firebase/firestore", adapter: "lib/firestore.ts" },
  { module: "firebase/auth", adapter: "lib/auth.ts" },
  { module: "firebase/storage", adapter: "lib/storage.ts" },
] as const;

function directImports(module: string, adapter: string): string[] {
  const escaped = module.replace("/", "\\/");
  const pattern = new RegExp(
    String.raw`(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']` + escaped + String.raw`(?:\/[^"']*)?["']`
  );
  const files = execSync(`git grep -l -e "${module}" -- "*.ts" "*.tsx" "*.js" "*.mjs" "*.cjs"`, {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => f !== adapter && !ALLOWED_DIRS.some((d) => f.startsWith(d)));

  const offenders: string[] = [];
  for (const file of files) {
    readFileSync(path.join(ROOT, file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (pattern.test(line) && !/vi\.mock\(/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
  }
  return offenders;
}

describe("Firebase import guard (SPENDLY-635/636/637)", () => {
  for (const { module, adapter } of GUARDED) {
    it(`app code never imports ${module} directly`, () => {
      expect(directImports(module, adapter)).toEqual([]);
    });
  }
});
