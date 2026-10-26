import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** SPENDLY-615 — the legacy report must stay read-only and private. */
const src = readFileSync(path.resolve(__dirname, "save-goals-legacy-report.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("save-goals-legacy-report", () => {
  it("never writes", () => {
    // `createHash(...).update(uid)` hashes a uid; it is not a Firestore write.
    const code = src.replace(/createHash\("sha256"\)\.update\(uid\)/g, "");
    expect(code).not.toMatch(/\.(set|update|delete|add|create|recursiveDelete)\(/);
    expect(src).not.toMatch(/\b(batch|bulkWriter|runTransaction)\b/);
  });

  it("prints hashed uids, never raw ones or goal names", () => {
    expect(src).toMatch(/user: hashUid\(userRef\.id\)/);
    expect(src).not.toMatch(/console\.log\([^)]*\.name/);
  });
});
