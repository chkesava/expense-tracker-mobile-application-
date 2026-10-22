import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  NET_WORTH_HISTORY_COLLECTION,
  NET_WORTH_HISTORY_DOC_FIELDS,
  NET_WORTH_HISTORY_SCHEMA_VERSION,
  NET_WORTH_POINT_FIELDS,
  netWorthSnapshotWrite,
} from "./netWorthHistory";

/** SPENDLY-568 — the history document and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const body = rules.slice(rules.indexOf("function netWorthPointOk("), rules.indexOf(`match /${NET_WORTH_HISTORY_COLLECTION}/`));
const quotedAll = (re: RegExp) =>
  [...body.matchAll(re)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((q) => q[1]));

describe("net-worth history rules contract", () => {
  it("has a validated match outside the personal catch-all", () => {
    expect(rules).toContain(`match /${NET_WORTH_HISTORY_COLLECTION}/{month}`);
    const wildcard = rules.slice(rules.indexOf("match /{collection}/{document=**}"));
    expect(wildcard.slice(0, wildcard.indexOf("];"))).not.toContain(`'${NET_WORTH_HISTORY_COLLECTION}'`);
  });

  it("allows exactly the document and point fields the app writes", () => {
    const hasOnly = quotedAll(/hasOnly\(\[([^\]]*)\]\)/g);
    const write = netWorthSnapshotWrite({ todayKey: "2026-10-22", totalNetWorth: 1, totalAssets: 1, totalLiabilities: 0, nowMs: 1, monthDocExists: false });
    expect(hasOnly).toContainEqual([...NET_WORTH_POINT_FIELDS]);
    expect(hasOnly).toContainEqual([...NET_WORTH_HISTORY_DOC_FIELDS]);
    expect(Object.keys(write.data).sort()).toEqual([...NET_WORTH_HISTORY_DOC_FIELDS].sort());
    expect(Object.keys(write.data.points["22"]).sort()).toEqual([...NET_WORTH_POINT_FIELDS].sort());
  });

  it("matches the schema version and the 31 day keys", () => {
    expect(body).toContain(`d.schemaVersion == ${NET_WORTH_HISTORY_SCHEMA_VERSION}`);
    const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(quotedAll(/d\.points\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/g)[0]).toEqual(days);
    for (const day of days) expect(body).toContain(`points.get('${day}', null)`);
  });

  it("is append-only and never deletable", () => {
    const match = rules.slice(rules.indexOf(`match /${NET_WORTH_HISTORY_COLLECTION}/`));
    const block = match.slice(0, match.indexOf("allow delete: if false;") + 1);
    expect(block).toContain("changedKeys().size() == 0");
    expect(block).toContain("removedKeys().size() == 0");
    expect(block).toContain("request.resource.data.createdAtMs == resource.data.createdAtMs");
    expect(match).toContain("allow delete: if false;");
  });

  it("never allows ledger-shaped fields", () => {
    const allowed = quotedAll(/hasOnly\(\[([^\]]*)\]\)/g).flat();
    for (const f of ["amount", "date", "accountId", "category", "balance"]) expect(allowed).not.toContain(f);
  });
});
