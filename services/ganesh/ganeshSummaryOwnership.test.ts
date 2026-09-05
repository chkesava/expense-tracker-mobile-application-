import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  CARRIED_SUMMARY_FIELDS,
  DERIVED_SUMMARY_FIELDS,
} from "@/shared/utils/ganeshSummaryDerive";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * The client does not maintain the festival summary any more (GS-004).
 *
 * The emulator suite in `firestore/ganeshSummaryOwnership.rules.test.ts` proves
 * the rules refuse a client write to a derived field. This is the cheap guard
 * beside it: `npm test` does not start an emulator, so without this a re-added
 * client-side summary write would typecheck, pass the unit suite, and only fail
 * in production — as a permission denial on a money write, which is what
 * GS-104 already showed is the worst way to find out.
 */
describe("client-side festival summary ownership", () => {
  const writeSources = [
    "services/ganesh/ganeshWrites.ts",
    "services/ganesh/ganeshSponsors.ts",
    "services/ganesh/ganeshPermanentFund.ts",
  ];

  it("no longer increments any derived summary field", () => {
    const offenders: string[] = [];
    for (const file of writeSources) {
      const source = read(file);
      for (const field of DERIVED_SUMMARY_FIELDS) {
        // `increment(` on a derived name is the shape the removed bumpSummary
        // wrote. Reading one is fine; a few screens still do.
        const pattern = new RegExp(`\\b${field}\\s*:\\s*increment\\(`);
        if (pattern.test(source)) offenders.push(`${file}: ${field}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no bumpSummary helper left to call", () => {
    for (const file of writeSources) {
      expect(read(file)).not.toContain("bumpSummary");
    }
  });

  it("still allocates the two carried fields client-side", () => {
    // These are not derivable from the ledger, so the backend never writes them
    // and the client must keep doing so (GS-077). Losing this would restart
    // receipt numbering.
    const source = read("services/ganesh/ganeshWrites.ts");
    for (const field of CARRIED_SUMMARY_FIELDS) {
      expect(source).toContain(field);
    }
  });

  it("asks the backend to recalculate rather than doing it locally", () => {
    const source = read("services/ganesh/ganeshWrites.ts");
    expect(source).toContain("recomputeGaneshSummary");
    // The old implementation read every ledger document and wrote the totals.
    expect(source).not.toContain("loadAllFestivalDocs");
  });

  it("leaves the derived fields to the trigger in the rules too", () => {
    const rules = read("firestore.rules");
    // A diff-based allowlist, not a key allowlist: on an update
    // `request.resource.data` is the whole resulting document, so a key
    // allowlist would refuse every legitimate allocator bump.
    expect(rules).toContain("summaryClientKeysAllowed");
    expect(rules).toContain("affectedKeys().hasOnly(allowed)");
  });
});
