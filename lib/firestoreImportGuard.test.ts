import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SPENDLY-635 — Firestore is imported through `@/lib/firestore` only, so the
 * native build can swap in `@react-native-firebase/firestore` in one place
 * (SPENDLY-638). A direct `firebase/firestore` import would silently keep
 * that module on the JS SDK's memory-only cache on native.
 *
 * Allowed: the adapter itself, the rules tests and Node scripts (they drive
 * the emulator with the web SDK), and `vi.mock("firebase/firestore", …)` in
 * tests (the adapter re-exports that module, so the mock still applies).
 */

const ROOT = path.resolve(__dirname, "..");

const ALLOWED_FILES = new Set(["lib/firestore.ts"]);
const ALLOWED_DIRS = ["firestore/", "scripts/"];

const DIRECT_IMPORT =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']firebase\/firestore(?:\/[^"']*)?["']/;

describe("Firestore import guard (SPENDLY-635)", () => {
  it("app code never imports firebase/firestore directly", () => {
    const files = execSync('git grep -l -e "firebase/firestore" -- "*.ts" "*.tsx" "*.js" "*.mjs" "*.cjs"', {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean)
      .filter((f) => !ALLOWED_FILES.has(f) && !ALLOWED_DIRS.some((d) => f.startsWith(d)));

    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (DIRECT_IMPORT.test(line) && !/vi\.mock\(/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
