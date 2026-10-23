import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { firestoreReader } from "../scripts/readmodel-sync";
import { runSync } from "../scripts/lib/readmodelSyncCore";
import { memorySink } from "../scripts/lib/readmodelSyncMemory";
import { firestoreCounter } from "../scripts/readmodel-verify";
import { runVerify, type VerifySink } from "../scripts/lib/readmodelVerifyCore";

/**
 * SPENDLY-506 end to end against the Firestore emulator: the real Admin SDK
 * queries (documentId paging past one page, createdAt/updatedAt range
 * queries with startAfter) feeding the real sync core. The Supabase side is
 * the in-memory sink, whose semantics match the SQL functions
 * (supabase-readmodel/tests/sync_functions.sql proves those).
 */
const PROJECT = "demo-readmodel-sync";
let app: App;
let db: Firestore;
const DAY = 24 * 3600 * 1000;

beforeAll(async () => {
  app = initializeApp({ projectId: PROJECT }, "readmodel-sync-e2e");
  db = getFirestore(app);
  const alice = db.collection("users").doc("alice");
  const past = Timestamp.fromMillis(Date.now() - DAY);
  const writer = db.bulkWriter();
  writer.set(alice.collection("expenses").doc("e1"), { amount: 100, date: "2026-10-20", category: "Food", createdAt: past });
  writer.set(alice.collection("expenses").doc("e2"), { amount: 250, date: "2026-10-21", category: "Fuel", createdAt: past });
  writer.set(alice.collection("accounts").doc("bank"), { name: "Bank", currentBalance: 1000 });
  writer.set(alice.collection("accounts").doc("old"), { name: "Old", currentBalance: 0 });
  for (let i = 0; i < 600; i++) {
    writer.set(alice.collection("categories").doc(`c${String(i).padStart(4, "0")}`), { name: `Cat ${i}`, createdAt: past });
  }
  writer.set(db.collection("users").doc("alice_duress").collection("expenses").doc("decoy"), { amount: 1, createdAt: past });
  await writer.close();
});

afterAll(async () => {
  await db.recursiveDelete(db.collection("users"));
  await deleteApp(app);
});

describe("read-model sync against the Firestore emulator (SPENDLY-506)", () => {
  it("copies in full, then picks up only what changed", async () => {
    const source = firestoreReader(db);
    const m = memorySink();
    const opts = { dryRun: false, maxReadsPerRun: 10_000, maxReadsPerDay: 100_000 };

    const firstStart = Date.now();
    const first = await runSync(source, m.sink, { ...opts, mode: "full", now: () => firstStart });
    expect(first.status).toBe("succeeded");
    expect([...m.tables.get("categories")!.values()]).toHaveLength(600);
    expect(m.row("expenses", "alice", "e1")).toMatchObject({ amount: 100, mapping_status: "mapped" });
    expect(m.row("expenses", "alice_duress", "decoy")).toBeUndefined();

    // Changes after the first run, written the way the app writes them.
    const alice = db.collection("users").doc("alice");
    await alice.collection("expenses").doc("e3").set({ amount: 40, date: "2026-10-22", createdAt: FieldValue.serverTimestamp() });
    await alice.collection("expenses").doc("e1").update({ amount: 120, updatedAt: FieldValue.serverTimestamp() });
    await alice.collection("accounts").doc("old").delete();
    await alice.collection("accounts").doc("bank").update({ currentBalance: 640 });

    const second = await runSync(source, m.sink, { ...opts, mode: "incremental", now: () => Date.now() });
    expect(second.status).toBe("succeeded");
    expect(m.row("expenses", "alice", "e3")).toMatchObject({ amount: 40 });
    expect(m.row("expenses", "alice", "e1")).toMatchObject({ amount: 120 });
    expect(m.row("expenses", "alice", "e2")).toMatchObject({ amount: 250 });
    expect(m.row("accounts", "alice", "old")?.source_deleted).toBe(true);
    expect(m.row("accounts", "alice", "bank")).toMatchObject({ current_balance: 640 });
    // The 600 categories were not re-read: an incremental run costs a few reads, not the collection.
    expect(second.readsUsed).toBeLessThan(40);
    expect(second.upserts).toBe(3);
  });

  it("count parity (SPENDLY-509): agrees after a full run, catches a row deleted by hand, and the next full run restores it", async () => {
    const source = firestoreReader(db);
    const m = memorySink();
    const syncOpts = { dryRun: false, maxReadsPerRun: 10_000, maxReadsPerDay: 100_000, mode: "full" as const };
    await runSync(source, m.sink, { ...syncOpts, now: () => Date.now() });

    const verifySink = (): VerifySink => ({
      readsUsedSince: async () => 0,
      purgedUids: async () => new Set<string>(),
      async liveCounts() {
        const counts = new Map<string, number>();
        const collectionOf: Record<string, string> = { expenses: "expenses", accounts: "accounts", categories: "categories" };
        for (const [table, rows] of m.tables) {
          for (const row of rows.values()) {
            if (row.source_deleted || !collectionOf[table]) continue;
            const key = `${row.uid}/${collectionOf[table]}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        return [...counts].map(([key, live]) => ({ uid: key.split("/")[0], collection: key.split("/")[1], live }));
      },
      recordCounts: async () => {},
      startRun: async () => null,
      finishRun: async () => {},
    });
    const counter = firestoreCounter(db);
    const vOpts = { maxReads: 1000, maxReadsPerDay: 100_000, now: () => Date.now() };

    const agree = await runVerify(counter, verifySink(), vOpts);
    expect(agree.status).toBe("succeeded");
    expect(agree.byCollection.find((c) => c.collection === "categories")).toMatchObject({ firestore: 600, model: 600 });
    // 600 categories counted for 1 read, not 600.
    expect(agree.readsUsed).toBeLessThan(30);

    m.tables.get("expenses")!.delete("alice/e2");
    const caught = await runVerify(counter, verifySink(), vOpts);
    expect(caught.status).toBe("failed");
    expect(caught.byCollection.find((c) => c.collection === "expenses")).toMatchObject({ mismatchedUsers: 1 });

    await runSync(source, m.sink, { ...syncOpts, now: () => Date.now() });
    expect(m.row("expenses", "alice", "e2")).toMatchObject({ amount: 250 });
    expect((await runVerify(counter, verifySink(), vOpts)).status).toBe("succeeded");
  });
});
