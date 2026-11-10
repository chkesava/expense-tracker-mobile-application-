import { describe, expect, it } from "vitest";

import { createReadModelRealtime, type ChangesSinceRow, type RealtimeChannelLike } from "@/lib/readModelRealtime";
import { configuredCollectionMode, effectiveCollectionMode } from "@/shared/utils/readModel/collectionMode";
import { configuredReadModelMode, deviceShadowEnabled } from "@/shared/utils/readModelMode";

import { memoryStoreFactory, withReadCache, type LocalRow } from "./store";

/** SPENDLY-745 (epic SPENDLY-735): lighter read-model work on the phone. */

const row = (docId: string): LocalRow => ({ docId, syncedAt: "2026-11-09T00:00:00Z", row: { doc_id: docId, doc: {} } });

describe("device compares are off unless readModel.deviceShadow is on", () => {
  it("shadow serves Firestore with no compare by default, for screens and collections alike", () => {
    expect(deviceShadowEnabled({})).toBe(false);
    expect(deviceShadowEnabled({ deviceShadow: "true" })).toBe(false);
    expect(configuredReadModelMode({ journal: "shadow" }, "journal")).toBe("firestore");
    expect(configuredCollectionMode({ expenses: "shadow" }, "expenses")).toBe("firestore");
    const decision = effectiveCollectionMode({
      setting: { creditCardBills: "shadow" },
      collection: "creditCardBills",
      envConfigured: true,
      localTestMode: false,
      duress: false,
      signedIn: true,
      localCopyOn: true,
      copyState: "ready",
      fellBack: false,
    });
    expect(decision.mode).toBe("firestore");
  });

  it("the owner can turn them back on for a drill; supabase is untouched either way", () => {
    expect(configuredReadModelMode({ journal: "shadow", deviceShadow: true }, "journal")).toBe("shadow");
    expect(configuredCollectionMode({ expenses: "shadow", deviceShadow: true }, "expenses")).toBe("shadow");
    expect(configuredReadModelMode({ journal: "supabase" }, "journal")).toBe("supabase");
    expect(configuredCollectionMode({ expenses: "supabase" }, "expenses")).toBe("supabase");
  });
});

describe("one storage read per table per change", () => {
  it("many screens reading a table after a change share one storage read", async () => {
    const store = withReadCache(await memoryStoreFactory().open("u1"));
    await store.put("expenses", [row("e1"), row("e2")]);
    const reads = await Promise.all([store.all("expenses"), store.all("expenses"), store.all("expenses")]);
    expect(reads.map((r) => r.length)).toEqual([2, 2, 2]);
    expect(store.readsFromStorage()).toBe(1);
    // Each caller gets its own array.
    reads[0]!.pop();
    expect((await store.all("expenses")).length).toBe(2);
    expect(store.readsFromStorage()).toBe(1);
  });

  it("every write to a table makes the next read fresh; other tables keep their cache", async () => {
    const store = withReadCache(await memoryStoreFactory().open("u1"));
    await store.put("expenses", [row("e1")]);
    await store.put("incomes", [row("i1")]);
    await store.all("expenses");
    await store.all("incomes");
    expect(store.readsFromStorage()).toBe(2);

    await store.put("expenses", [row("e2")]);
    expect((await store.all("expenses")).map((r) => r.docId).sort()).toEqual(["e1", "e2"]);
    await store.remove("expenses", ["e1"]);
    expect((await store.all("expenses")).map((r) => r.docId)).toEqual(["e2"]);
    await store.evictOldest("expenses", 0);
    expect(await store.all("expenses")).toEqual([]);
    await store.put("expenses", [row("e3")]);
    await store.clear("expenses");
    expect(await store.all("expenses")).toEqual([]);
    await store.all("incomes");
    expect(store.readsFromStorage()).toBe(6);
  });
});

describe("no realtime catch-up polls in the background", () => {
  it("a tick while the app is in the background reads nothing; the next active tick catches up", async () => {
    const since: string[] = [];
    const timers: (() => void)[] = [];
    let active = true;
    const rt = createReadModelRealtime({
      canListen: () => true,
      channel: async () => null as RealtimeChannelLike | null,
      removeChannel: () => undefined,
      changesSince: async (s) => {
        since.push(s);
        return { data: [] as ChangesSinceRow[], error: null };
      },
      setInterval: (fn) => timers.push(fn) - 1,
      clearInterval: () => undefined,
      active: () => active,
    });
    await rt.start("u1", "2026-11-09T00:00:00.000Z");
    expect(timers).toHaveLength(1);
    active = false;
    timers[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(since).toHaveLength(0);
    active = true;
    timers[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(since).toHaveLength(1);
  });
});
