import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildUserBaseline } from "../shared/utils/financialBaseline";
import { FIXTURE_TODAY, fullLedgerFixture } from "../shared/__fixtures__/readModel/fullLedger";
import { hashUid, renderSummaryMarkdown, summarizeBaselines } from "./readmodel-baseline";

const WRITE_CALLS = /\.(set|update|delete|create|commit|batch|bulkWriter|runTransaction|recursiveDelete)\(/;

describe("readmodel-baseline (SPENDLY-503)", () => {
  it.each(["scripts/readmodel-baseline.ts", "shared/utils/financialBaseline.ts"])(
    "%s makes no Firestore write calls",
    (file) => {
      // A sha256 hash's `.update(` is not a write.
      const source = readFileSync(path.resolve(__dirname, "..", file), "utf8").replace(
        /createHash\([^)]*\)\.update\(/g,
        ""
      );
      expect(source).not.toMatch(WRITE_CALLS);
    }
  );

  it("hashes uids to a stable label that does not contain the uid", () => {
    expect(hashUid("abc123")).toBe(hashUid("abc123"));
    expect(hashUid("abc123")).toMatch(/^u#[0-9a-f]{10}$/);
    expect(hashUid("abc123")).not.toContain("abc123");
  });

  it("summarizes without names or amounts", () => {
    const baseline = buildUserBaseline(fullLedgerFixture(), FIXTURE_TODAY);
    const summary = summarizeBaselines([baseline, baseline], 1);
    expect(summary.users).toBe(2);
    expect(summary.usersFailed).toBe(1);
    expect(summary.accounts).toEqual({ total: 6, match: 6, variance: 0, missing: 0 });
    expect(summary.documents.expenses).toBe(16);
    const md = renderSummaryMarkdown(FIXTURE_TODAY, "emulator", summary);
    expect(md).not.toContain("Fixture Bank");
    expect(md).not.toContain("65650");
  });
});
