import { describe, expect, it, vi } from "vitest";

import {
  CATCH_UP_OVERLAP_MS,
  createReadModelRealtime,
  type ChangesSinceRow,
  type ReadModelChangeEvent,
  type ReadModelRealtimeDeps,
  type RealtimeChannelLike,
} from "./readModelRealtime";

/** A fake private channel: the test fires pings and status changes by hand. */
function fakeChannel() {
  let ping: ((m: { payload?: unknown }) => void) | null = null;
  let status: ((s: string, e?: unknown) => void) | null = null;
  const channel: RealtimeChannelLike = {
    on: (_type, filter, cb) => {
      expect(filter).toEqual({ event: "changed" });
      ping = cb;
      return channel;
    },
    subscribe: (cb) => {
      status = cb ?? null;
      return channel;
    },
  };
  return { channel, ping: (payload: unknown) => ping?.({ payload }), status: (s: string) => status?.(s) };
}

function setup(overrides: Partial<ReadModelRealtimeDeps> = {}) {
  const ch = fakeChannel();
  const since: string[] = [];
  let rows: ChangesSinceRow[] = [];
  const timers: (() => void)[] = [];
  const removed: RealtimeChannelLike[] = [];
  const deps: ReadModelRealtimeDeps = {
    canListen: () => true,
    channel: vi.fn(async () => ch.channel),
    removeChannel: (c) => void removed.push(c),
    changesSince: async (s) => {
      since.push(s);
      return { data: rows, error: null };
    },
    setInterval: (fn) => timers.push(fn) - 1,
    clearInterval: (h) => {
      timers[h as number] = () => {};
    },
    pollMs: 30_000,
    limit: 3,
    ...overrides,
  };
  const rt = createReadModelRealtime(deps);
  const events: ReadModelChangeEvent[] = [];
  rt.subscribe((e) => events.push(e));
  return { rt, ch, since, events, timers, removed, deps, setRows: (r: ChangesSinceRow[]) => (rows = r) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("read-model realtime (SPENDLY-593)", () => {
  it("joins the user's channel and turns a ping into change events (no document data needed)", async () => {
    const s = setup();
    await s.rt.start("u1");
    expect(s.deps.channel).toHaveBeenCalledWith("u1");
    s.ch.status("SUBSCRIBED");
    s.ch.ping({ table: "expenses", synced_at: "2026-11-04T10:00:00.000Z", changes: [{ doc_id: "e1", deleted: false }, { doc_id: "e2", deleted: true }] });
    expect(s.events).toEqual([
      {
        kind: "changes",
        changes: [
          { table: "expenses", docId: "e1", deleted: false, syncedAt: "2026-11-04T10:00:00.000Z" },
          { table: "expenses", docId: "e2", deleted: true, syncedAt: "2026-11-04T10:00:00.000Z" },
        ],
      },
    ]);
    expect(s.rt.status()).toMatchObject({ state: "live", lastSeen: "2026-11-04T10:00:00.000Z" });
  });

  it("a resync ping asks the consumer to refetch that table; malformed pings are ignored", async () => {
    const s = setup();
    await s.rt.start("u1");
    s.ch.ping({ table: "expenses", synced_at: "2026-11-04T10:00:00.000Z", resync: true });
    s.ch.ping(null);
    s.ch.ping({ changes: [{ doc_id: "x" }] });
    s.ch.ping({ table: "expenses", changes: [{ nope: 1 }] });
    expect(s.events).toEqual([{ kind: "resync", table: "expenses" }]);
  });

  it("on reconnect it catches up from the last synced_at seen, less the overlap, deletes included", async () => {
    const s = setup();
    await s.rt.start("u1");
    s.ch.status("SUBSCRIBED");
    s.ch.ping({ table: "expenses", synced_at: "2026-11-04T10:00:00.000Z", changes: [{ doc_id: "e1", deleted: false }] });
    s.ch.status("CHANNEL_ERROR");
    s.setRows([{ table_name: "incomes", doc_id: "i1", synced_at: "2026-11-04T10:05:00.000Z", deleted: true }]);
    s.ch.status("SUBSCRIBED");
    await flush();
    expect(s.since).toEqual([new Date(Date.parse("2026-11-04T10:00:00.000Z") - CATCH_UP_OVERLAP_MS).toISOString()]);
    expect(s.events.at(-1)).toEqual({ kind: "changes", changes: [{ table: "incomes", docId: "i1", deleted: true, syncedAt: "2026-11-04T10:05:00.000Z" }] });
    expect(s.rt.status().lastSeen).toBe("2026-11-04T10:05:00.000Z");
  });

  it("while down it polls the catch-up; back live, polling stops", async () => {
    const s = setup();
    await s.rt.start("u1", "2026-11-04T09:00:00.000Z");
    s.ch.status("TIMED_OUT");
    expect(s.rt.status().state).toBe("down");
    expect(s.timers).toHaveLength(1);
    s.timers[0]();
    await flush();
    expect(s.since).toHaveLength(1);
    s.ch.status("SUBSCRIBED");
    await flush();
    s.timers[0](); // cleared: a no-op now
    await flush();
    expect(s.since).toHaveLength(2); // the reconnect catch-up only
  });

  it("a full page from the catch-up also asks for a resync (there may be more)", async () => {
    const s = setup();
    await s.rt.start("u1", "2026-11-04T09:00:00.000Z");
    s.setRows([1, 2, 3].map((i) => ({ table_name: "expenses", doc_id: `e${i}`, synced_at: `2026-11-04T09:0${i}:00.000Z`, deleted: false })));
    s.ch.status("SUBSCRIBED");
    await flush();
    expect(s.events.at(-1)).toEqual({ kind: "resync" });
  });

  it("no baseline on a reconnect: resync rather than guess", async () => {
    const s = setup();
    await s.rt.start("u1");
    s.ch.status("SUBSCRIBED");
    s.ch.status("CLOSED");
    s.ch.status("SUBSCRIBED");
    await flush();
    expect(s.since).toEqual([]);
    expect(s.events).toEqual([{ kind: "resync" }]);
  });

  it("never listens when it may not (duress, signed out, setting off, Spendly Test)", async () => {
    const s = setup({ canListen: () => false });
    await s.rt.start("u1");
    expect(s.deps.channel).not.toHaveBeenCalled();
    expect(s.rt.status().state).toBe("off");
  });

  it("stop leaves the channel and ignores anything late; a new user gets a fresh channel", async () => {
    const s = setup();
    await s.rt.start("u1");
    s.rt.stop();
    expect(s.removed).toHaveLength(1);
    s.ch.ping({ table: "expenses", synced_at: "2026-11-04T10:00:00.000Z", changes: [{ doc_id: "late" }] });
    expect(s.events).toEqual([]);
    await s.rt.start("u2");
    expect(s.deps.channel).toHaveBeenLastCalledWith("u2");
  });

  it("not connected yet: it polls instead of failing", async () => {
    const s = setup({ channel: async () => null });
    await s.rt.start("u1", "2026-11-04T09:00:00.000Z");
    expect(s.rt.status().state).toBe("down");
    expect(s.timers).toHaveLength(1);
  });
});
