import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { netWorthSnapshotWrite } from "@/shared/utils/netWorthHistory";

/** SPENDLY-568 — append-only monthly net-worth history. */
const OWNER = "nw-owner";
const OTHER = "nw-other";
let env: RulesTestEnvironment;

const point = (netWorth: number) => ({ netWorth, assets: netWorth + 100, liabilities: 100, recordedAtMs: 1000 });
const existing = {
  month: "2026-10",
  points: { "01": point(1000) },
  schemaVersion: 1,
  createdAtMs: 1000,
  updatedAtMs: 1000,
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "spendly-net-worth-history",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080) },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", OWNER, "netWorthHistory", "2026-10"), existing);
  });
});

const ownerDb = () => env.authenticatedContext(OWNER).firestore();
const monthRef = (month: string, uid = OWNER, db = ownerDb()) => doc(db, "users", uid, "netWorthHistory", month);

describe("netWorthHistory rules", () => {
  it("owner reads, creates a new month and appends a day exactly as the app writes them", async () => {
    const db = ownerDb();
    await assertSucceeds(getDocs(collection(db, "users", OWNER, "netWorthHistory")));

    const created = netWorthSnapshotWrite({ todayKey: "2026-11-03", totalNetWorth: 5, totalAssets: 10, totalLiabilities: 5, nowMs: 2000, monthDocExists: false });
    await assertSucceeds(setDoc(monthRef(created.monthKey, OWNER, db), created.data, { merge: true }));

    const appended = netWorthSnapshotWrite({ todayKey: "2026-10-02", totalNetWorth: 1200, totalAssets: 1300, totalLiabilities: 100, nowMs: 3000, monthDocExists: true });
    await assertSucceeds(setDoc(monthRef("2026-10", OWNER, db), appended.data, { merge: true }));
  });

  it("is idempotent: replaying an identical point is allowed", async () => {
    await assertSucceeds(setDoc(monthRef("2026-10"), { points: { "01": point(1000) }, updatedAtMs: 4000 }, { merge: true }));
  });

  it("never lets a recorded day change or disappear", async () => {
    await assertFails(setDoc(monthRef("2026-10"), { points: { "01": point(999) }, updatedAtMs: 4000 }, { merge: true }));
    await assertFails(setDoc(monthRef("2026-10"), { ...existing, points: { "02": point(5) } }));
    await assertFails(updateDoc(monthRef("2026-10"), { createdAtMs: 5 }));
    await assertFails(deleteDoc(monthRef("2026-10")));
  });

  it("validates every new point", async () => {
    const bad = (p: Record<string, unknown>) => setDoc(monthRef("2026-10"), { points: { "05": p }, updatedAtMs: 4000 }, { merge: true });
    await assertFails(bad({ ...point(1), extra: true }));
    await assertFails(bad({ netWorth: 1, assets: 1, liabilities: 0 }));
    await assertFails(bad({ ...point(1), netWorth: "1" }));
    await assertFails(bad({ ...point(1), assets: 2e12 }));
    await assertSucceeds(bad({ ...point(-5000), assets: 0, liabilities: 5000 }));
  });

  it("rejects bad months, day keys and schema pollution", async () => {
    const db = ownerDb();
    const fresh = { month: "2026-13", points: { "01": point(1) }, schemaVersion: 1, createdAtMs: 1, updatedAtMs: 1 };
    await assertFails(setDoc(monthRef("2026-13", OWNER, db), fresh));
    await assertFails(setDoc(monthRef("2026-09", OWNER, db), { ...fresh, month: "2026-08" }));
    await assertFails(setDoc(monthRef("2026-09", OWNER, db), { ...fresh, month: "2026-09", points: { "32": point(1) } }));
    await assertFails(setDoc(monthRef("2026-09", OWNER, db), { ...fresh, month: "2026-09", points: {} }));
    await assertFails(setDoc(monthRef("2026-09", OWNER, db), { ...fresh, month: "2026-09", schemaVersion: 2 }));
    await assertFails(setDoc(monthRef("2026-09", OWNER, db), { ...fresh, month: "2026-09", amount: 5 }));
  });

  it("isolates users", async () => {
    const other = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDocs(collection(other, "users", OWNER, "netWorthHistory")));
    await assertFails(setDoc(monthRef("2026-10", OWNER, other), { points: { "02": point(1) }, updatedAtMs: 1 }, { merge: true }));
  });
});
