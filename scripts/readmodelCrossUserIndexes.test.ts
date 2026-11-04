import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { READ_MODEL_TABLES } from "../shared/utils/readModel/mapping";
import { ALWAYS_FULL } from "./lib/readmodelSyncCore";

/**
 * SPENDLY-672: the safety-net nights query each synced collection across all
 * users (`collectionGroup(c).where(createdAt|updatedAt > t).orderBy(…)`), which
 * needs a collection-group index on both fields. A field override replaces the
 * field's automatic indexes, so each one must also restate them: the app's own
 * queries order these fields both ways.
 */
type Override = { collectionGroup: string; fieldPath: string; indexes: Record<string, string>[] };
const config = JSON.parse(readFileSync(join(__dirname, "..", "firestore.indexes.json"), "utf8")) as { fieldOverrides: Override[] };

const DEFAULTS_PLUS_GROUP = [
  { order: "ASCENDING", queryScope: "COLLECTION" },
  { order: "DESCENDING", queryScope: "COLLECTION" },
  { arrayConfig: "CONTAINS", queryScope: "COLLECTION" },
  { order: "ASCENDING", queryScope: "COLLECTION_GROUP" },
];

const groups = [
  ...new Set(READ_MODEL_TABLES.filter((t) => !t.root && !ALWAYS_FULL.has(t.collection)).map((t) => (t.parent ? t.parent.child : t.collection))),
];

describe("collection-group indexes for the cross-user sync (SPENDLY-672)", () => {
  it.each(groups.flatMap((g) => ["createdAt", "updatedAt"].map((f) => [g, f] as const)))("%s.%s has the defaults plus a collection-group index", (group, field) => {
    const override = config.fieldOverrides.find((o) => o.collectionGroup === group && o.fieldPath === field);
    expect(override?.indexes).toEqual(DEFAULTS_PLUS_GROUP);
  });

  it("stays well under Firestore's 200 field-override limit, and keeps the existing overrides", () => {
    expect(config.fieldOverrides.length).toBeLessThan(200);
    for (const [group, field] of [["epfEstablishments", "employmentStatus"], ["members", "userId"]]) {
      expect(config.fieldOverrides.some((o) => o.collectionGroup === group && o.fieldPath === field)).toBe(true);
    }
  });
});
