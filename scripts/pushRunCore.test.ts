import { describe, expect, it, vi } from "vitest";

import type { AdminFirestoreLike } from "../shared/utils/push/firestorePorts";
import { SETTINGS_DEFAULTS } from "../shared/types/settings";
import type { ReminderSource } from "../shared/utils/push/reminderEngine";
import { meteredFirestore, readBudget, runPushReminders } from "./lib/pushRunCore";

/** In-memory Admin Firestore surface (enough for the ports and the run). */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const docs = new Map(Object.entries(seed));
  const snap = (path: string) => ({ exists: docs.has(path), id: path.split("/").pop()!, ref: { path }, data: () => docs.get(path) });
  const query = (match: (p: string) => boolean, filters: [string, unknown][] = []): ReturnType<AdminFirestoreLike["collection"]> => ({
    where: (field, op, value) => query(match, [...filters, [field, op === "in" ? value : [value]]]),
    limit: () => query(match, filters),
    get: async () => ({
      docs: [...docs.keys()].filter(match).filter((p) => filters.every(([f, vals]) => (vals as unknown[]).includes(docs.get(p)?.[f]))).map(snap),
    }),
  });
  const db: AdminFirestoreLike = {
    doc: (path) => ({
      path,
      get: async () => snap(path),
      create: async (data) => {
        if (docs.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
        docs.set(path, data);
      },
      set: async (data, o) => void docs.set(path, o?.merge ? { ...docs.get(path), ...data } : data),
    }),
    collection: (path) => query((p) => p.startsWith(`${path}/`) && p.split("/").length === path.split("/").length + 1),
    collectionGroup: (id) => query((p) => p.split("/").at(-2) === id),
    batch: () => {
      const dels: { path: string }[] = [];
      return { delete: (ref) => void dels.push(ref as { path: string }), commit: async () => dels.forEach((r) => docs.delete(r.path)) };
    },
  };
  return { db, docs };
}

const NOW = new Date("2026-11-06T04:00:00Z"); // 09:30 IST
const TOKEN = "ExponentPushToken[tok-u1-000000]";

function seed(extra: Record<string, Record<string, unknown>> = {}) {
  return {
    "users/u1": { timezone: "Asia/Kolkata", pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: { start: "08:00", end: "21:00" } } },
    "users/u1/devices/i1": { token: TOKEN, product: "expense", lastSeenAt: new Date(1) },
    ...extra,
  };
}

const source: ReminderSource<{ id: string }> = {
  name: "test",
  category: "bills",
  candidates: async () => [{ uid: "u1", item: { id: "b1" } }],
  itemId: (i) => i.id,
  slotsFor: (_i, ctx) => [{ slotId: "ccbill:b1:due", date: ctx.today, time: "09:00", kind: "bill_due", title: "Bill due", body: "Today", url: "/credit-card-bills/b1" }],
  reload: async () => ({ id: "b1" }),
};

const okFetch = () =>
  vi.fn(async (url: string, init: { body: string }) => ({
    status: 200,
    json: async () =>
      url.endsWith("/send")
        ? { data: (JSON.parse(init.body) as unknown[]).map((_, i) => ({ status: "ok", id: `t${i}` })) }
        : { data: {} },
  }));

describe("readBudget and meteredFirestore", () => {
  it("allows the smaller of the per-run cap and what's left today", () => {
    const b = readBudget({ perRun: 400, perDay: 6000, usedToday: 5900 });
    b.add(99);
    expect(b.exhausted()).toBe(false);
    b.add(1);
    expect(b.exhausted()).toBe(true);
    expect(readBudget({ perRun: 400, perDay: 6000, usedToday: 7000 }).exhausted()).toBe(true);
  });

  it("counts a document get as 1 and a query as its documents (at least 1)", async () => {
    const f = fakeDb(seed());
    const b = readBudget({ perRun: 100, perDay: 100, usedToday: 0 });
    const db = meteredFirestore(f.db, b);
    await db.doc("users/u1").get();
    await db.collection("users/u1/devices").get();
    await db.collection("empty").get();
    expect(b.spent()).toBe(3);
  });
});

describe("runPushReminders", () => {
  it("sends due reminders, logs them, and records the day's reads", async () => {
    const f = fakeDb(seed());
    const fetch = okFetch();
    vi.stubGlobal("fetch", fetch);
    const summary = await runPushReminders({ db: f.db, sources: [source], now: NOW, dryRun: false, maxReadsPerRun: 400, maxReadsPerDay: 6000, readModel: null, log: () => undefined });
    vi.unstubAllGlobals();

    expect(summary.engine).toMatchObject({ sent: 1 });
    expect(f.docs.get("pushSendLogs/u1:ccbill:b1:due")).toMatchObject({ status: "done", receiptsPending: true, accepted: 1 });
    expect(f.docs.get("pushConfig/usage-2026-11-06")?.reads).toBe(summary.reads);
    expect(summary.reads).toBeGreaterThan(0);
  });

  it("dry run decides but sends, claims and writes nothing", async () => {
    const f = fakeDb(seed());
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const lines: string[] = [];
    const summary = await runPushReminders({ db: f.db, sources: [source], now: NOW, dryRun: true, maxReadsPerRun: 400, maxReadsPerDay: 6000, readModel: null, log: (l) => lines.push(l) });
    vi.unstubAllGlobals();

    expect(summary.engine.sent).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect([...f.docs.keys()].some((k) => k.startsWith("pushSendLogs/") || k.startsWith("pushConfig/"))).toBe(false);
    expect(lines.some((l) => l.includes("[DRY RUN] would send 1"))).toBe(true);
  });

  it("dry run never calls a source's onSent (SPENDLY-715: the bill source writes a reminder log there)", async () => {
    const onSent = vi.fn(async () => undefined);
    const run = (db: AdminFirestoreLike, dryRun: boolean) =>
      runPushReminders({ db, sources: [{ ...source, onSent }], now: NOW, dryRun, maxReadsPerRun: 400, maxReadsPerDay: 6000, readModel: null, log: () => undefined });

    // The go-live case: the kill switch is on, so the send is "disabled".
    await run(fakeDb(seed({ "pushConfig/global": { sendsDisabled: true } })).db, true);
    expect(onSent).not.toHaveBeenCalled();

    await run(fakeDb(seed({ "pushConfig/global": { sendsDisabled: true } })).db, false);
    expect(onSent).toHaveBeenCalledWith("u1", "b1", expect.objectContaining({ slotId: "ccbill:b1:due" }), "disabled");
  });

  it("stops early once today's allowance is used up", async () => {
    const f = fakeDb(seed({ "pushConfig/usage-2026-11-06": { reads: 6000 } }));
    const summary = await runPushReminders({ db: f.db, sources: [source], now: NOW, dryRun: false, maxReadsPerRun: 400, maxReadsPerDay: 6000, readModel: null, log: () => undefined });
    expect(summary.engine).toMatchObject({ sent: 0 });
  });

  it("reads receipts 15 min – 24 h old, prunes unregistered devices and tells the read model", async () => {
    const f = fakeDb(
      seed({
        "pushSendLogs/old": { receiptsPending: true, finishedAt: new Date(NOW.getTime() - 30 * 60_000), pendingReceipts: [{ id: "r1", uid: "u1", installId: "i1" }] },
        "pushSendLogs/fresh": { receiptsPending: true, finishedAt: new Date(NOW.getTime() - 5 * 60_000), pendingReceipts: [{ id: "r2", uid: "u1", installId: "i1" }] },
      })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, json: async () => ({ data: { r1: { status: "error", details: { error: "DeviceNotRegistered" } } } }) }))
    );
    const note = vi.fn();
    const flush = vi.fn(async () => ({ pushed: 0, tombstoned: 1 }));
    const summary = await runPushReminders({ db: f.db, sources: [], now: NOW, dryRun: false, maxReadsPerRun: 400, maxReadsPerDay: 6000, readModel: { note, flush }, log: () => undefined });
    vi.unstubAllGlobals();

    expect(summary.receipts).toMatchObject({ logs: 1, checked: 1, pruned: 1 });
    expect(f.docs.has("users/u1/devices/i1")).toBe(false);
    expect(note).toHaveBeenCalledWith("u1", ["users/u1/devices/i1"]);
    expect(flush).toHaveBeenCalled();
    expect(f.docs.get("pushSendLogs/old")).toMatchObject({ receiptsPending: false, pendingReceipts: [] });
    expect(f.docs.get("pushSendLogs/fresh")).toMatchObject({ receiptsPending: true });
  });
});

describe("hourly event pass (SPENDLY-229)", () => {
  const eventSource = {
    name: "test-events",
    category: "investments" as const,
    poll: async () => [{ uid: "u1", key: "evt:1", kind: "sip_executed", title: "SIP Executed", body: "Fund", url: "/investments", entityId: "p1" }],
  };

  it("runs in the first quarter of the hour, and not otherwise", async () => {
    vi.stubGlobal("fetch", okFetch());
    const atQuarterPast = await runPushReminders({ db: fakeDb(seed()).db, sources: [], eventSources: [eventSource], now: new Date("2026-11-06T04:20:00Z"), dryRun: false, maxReadsPerRun: 400, maxReadsPerDay: 6000, readModel: null, log: () => undefined });
    expect(atQuarterPast.events).toBeNull();
    const onTheHour = await runPushReminders({ db: fakeDb(seed()).db, sources: [], eventSources: [eventSource], now: new Date("2026-11-06T04:05:00Z"), dryRun: false, maxReadsPerRun: 400, maxReadsPerDay: 6000, readModel: null, log: () => undefined });
    vi.unstubAllGlobals();
    expect(onTheHour.events).toMatchObject({ events: 1, sent: 1 });
  });
});
