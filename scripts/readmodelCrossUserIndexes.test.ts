import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { changeFieldsOf, READ_MODEL_TABLES } from "../shared/utils/readModel/mapping";
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

const queried = READ_MODEL_TABLES.filter((t) => !t.root && !ALWAYS_FULL.has(t.collection));
// SPENDLY-681: every change field of every collection (createdAt/updatedAt, plus *Ms or event times).
const pairs = [
  ...new Map(
    queried.flatMap((t) => changeFieldsOf(t).map((c) => [t.parent ? t.parent.child : t.collection, c.field] as const)).map((p) => [p.join("."), p])
  ).values(),
];

describe("collection-group indexes for the cross-user sync (SPENDLY-672)", () => {
  it.each(pairs)("%s.%s has the defaults plus a collection-group index", (group, field) => {
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
