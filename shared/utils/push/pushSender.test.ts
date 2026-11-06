import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PUSH_NOTIFICATIONS } from "../pushPreferences";
import {
  EXPO_CHUNK,
  buildMessage,
  latestOwnerByToken,
  processReceipts,
  sendLogId,
  sendToUsers,
  type DeviceRecord,
  type ExpoMessage,
  type ExpoTicket,
  type PushPorts,
  type PushRequest,
  type SendLog,
} from "./pushSender";

const tok = (n: string | number) => `ExponentPushToken[tok${String(n).padStart(6, "0")}]`;
const device = (uid: string, n: string | number, lastSeenAtMs = 1000, over: Partial<DeviceRecord> = {}): DeviceRecord => ({
  uid,
  installId: `inst-${uid}-${n}`,
  token: tok(n),
  product: "expense",
  lastSeenAtMs,
  ...over,
});

const request = (over: Partial<PushRequest> = {}): PushRequest => ({
  uids: ["u1"],
  category: "investments",
  kind: "sip_failed",
  title: "SIP failed",
  body: "Your Nifty 50 SIP couldn't run today.",
  url: "/sip",
  entityId: "sip1",
  idempotencyKey: "sip:sip1:2026-11-06:failed",
  ...over,
});

function fakePorts(state: {
  devices?: DeviceRecord[];
  prefs?: Record<string, unknown>;
  killSwitch?: boolean;
  claimed?: Set<string>;
  respond?: (msgs: readonly ExpoMessage[], call: number) => { httpStatus: number; tickets: ExpoTicket[] } | Error;
}) {
  const devices = state.devices ?? [];
  const claimed = state.claimed ?? new Set<string>();
  const sent: ExpoMessage[][] = [];
  const deleted: { uid: string; installId: string }[] = [];
  const logs = new Map<string, SendLog>();
  let calls = 0;
  const ports: PushPorts = {
    killSwitchOn: async () => state.killSwitch ?? false,
    claim: async (key) => (claimed.has(key) ? false : (claimed.add(key), true)),
    loadPreferences: async (uid) => (state.prefs?.[uid] as never) ?? null,
    loadDevices: async (uid) => devices.filter((d) => d.uid === uid),
    findTokenOwners: async (tokens) => devices.filter((d) => tokens.includes(d.token)),
    deleteDevices: async (list) => void deleted.push(...list),
    sendExpo: async (msgs) => {
      calls++;
      const r = state.respond?.(msgs, calls) ?? { httpStatus: 200, tickets: msgs.map((_, i) => ({ status: "ok" as const, id: `t${calls}-${i}` })) };
      if (r instanceof Error) throw r;
      sent.push([...msgs]);
      return r;
    },
    getReceipts: async () => ({}),
    finishLog: async (key, log) => void logs.set(key, log),
    sleep: vi.fn(async () => undefined),
    log: vi.fn(),
  };
  return { ports, sent, deleted, logs, claimed, calls: () => calls };
}

describe("sendToUsers", () => {
  it("sends to each of the user's Spendly devices with the small payload and the category channel", async () => {
    const f = fakePorts({ devices: [device("u1", 1), device("u1", 2)] });
    const res = await sendToUsers(request({ ttlSeconds: 3600 }), f.ports);

    expect(res).toMatchObject({ status: "sent", recipients: 1, messages: 2, accepted: 2, pruned: 0 });
    expect(f.sent[0][0]).toEqual({
      to: tok(1),
      title: "SIP failed",
      body: "Your Nifty 50 SIP couldn't run today.",
      data: { product: "expense", category: "investments", kind: "sip_failed", url: "/sip", entityId: "sip1" },
      channelId: "investments",
      priority: "default",
      sound: "default",
      ttl: 3600,
    });
    const log = f.logs.get(sendLogId(request().idempotencyKey))!;
    expect(log.pendingReceipts.map((p) => p.installId)).toEqual(["inst-u1-1", "inst-u1-2"]);
    expect(JSON.stringify(log)).not.toContain("ExponentPushToken");
  });

  it("never sends the same idempotency key twice", async () => {
    const f = fakePorts({ devices: [device("u1", 1)] });
    await sendToUsers(request(), f.ports);
    expect(await sendToUsers(request(), f.ports)).toEqual({ status: "duplicate" });
    expect(f.sent).toHaveLength(1);
  });

  it("sends nothing while the kill switch is on, and doesn't use up the key", async () => {
    const f = fakePorts({ devices: [device("u1", 1)], killSwitch: true });
    expect(await sendToUsers(request(), f.ports)).toEqual({ status: "disabled" });
    expect(f.sent).toHaveLength(0);
    expect(f.claimed.size).toBe(0);
  });

  it("skips the actor, duress uids and users who turned the category off", async () => {
    const off = { ...DEFAULT_PUSH_NOTIFICATIONS, categories: { investments: false, shared: true, priceAlerts: true } };
    const f = fakePorts({
      devices: [device("actor", 1), device("u1", 2), device("u2", 3), device("u3_duress", 4)],
      prefs: { u2: { pushNotifications: off } },
    });
    const res = await sendToUsers(request({ uids: ["actor", "u1", "u2", "u3_duress", "u1"], actorUid: "actor" }), f.ports);

    expect(res).toMatchObject({ recipients: 2, optedOut: 1, messages: 1 });
    expect(f.sent.flat().map((m) => m.to)).toEqual([tok(2)]);
  });

  it("uses the reminder switches the user already has", async () => {
    const f = fakePorts({ devices: [device("u1", 1)], prefs: { u1: { creditCardBillReminders: { enabled: false } } } });
    expect(await sendToUsers(request({ category: "bills" }), f.ports)).toMatchObject({ optedOut: 1, messages: 0 });
  });

  it("ignores other products' devices and invalid tokens, and counts users with no device", async () => {
    const f = fakePorts({
      devices: [device("u1", 1, 1000, { product: "ganesh" }), device("u1", 2, 1000, { token: "raw-fcm" }), device("u2", 3)],
    });
    const res = await sendToUsers(request({ uids: ["u1", "u2"] }), f.ports);
    expect(res).toMatchObject({ noDevice: 1, messages: 1 });
    expect(f.sent.flat().map((m) => m.to)).toEqual([tok(3)]);
  });

  it("sends a token shared by two accounts only to the one that used it last", async () => {
    // u1 signed out elsewhere (couldn't delete), then u2 signed in on the same phone.
    const shared = { token: tok(9) };
    const f = fakePorts({ devices: [device("u1", "a", 1000, shared), device("u2", "b", 5000, shared)] });

    expect(await sendToUsers(request({ uids: ["u1"] }), f.ports)).toMatchObject({ messages: 0 });
    expect(await sendToUsers(request({ uids: ["u2"], idempotencyKey: "k2" }), f.ports)).toMatchObject({ messages: 1 });
    expect(f.sent.flat()).toHaveLength(1);
  });

  it("sends one message per token even if a user registered it twice", async () => {
    const f = fakePorts({ devices: [device("u1", "a", 1000, { token: tok(7) }), device("u1", "b", 2000, { token: tok(7) })] });
    expect(await sendToUsers(request(), f.ports)).toMatchObject({ messages: 1 });
  });

  it("chunks at 100 messages per request", async () => {
    const f = fakePorts({ devices: Array.from({ length: 230 }, (_, i) => device(`u${i}`, i)) });
    await sendToUsers(request({ uids: Array.from({ length: 230 }, (_, i) => `u${i}`) }), f.ports);
    expect(f.sent.map((c) => c.length)).toEqual([EXPO_CHUNK, EXPO_CHUNK, 30]);
  });

  it("prunes DeviceNotRegistered and counts other ticket errors", async () => {
    const f = fakePorts({
      devices: [device("u1", 1), device("u1", 2), device("u1", 3)],
      respond: () => ({
        httpStatus: 200,
        tickets: [
          { status: "ok", id: "t1" },
          { status: "error", details: { error: "DeviceNotRegistered" } },
          { status: "error", details: { error: "MessageTooBig" } },
        ],
      }),
    });
    const res = await sendToUsers(request(), f.ports);
    expect(res).toMatchObject({ accepted: 1, pruned: 1, errors: { DeviceNotRegistered: 1, MessageTooBig: 1 } });
    expect(f.deleted).toEqual([{ uid: "u1", installId: "inst-u1-2" }]);
  });

  it("retries 429/5xx and network errors with backoff, capped at 3 attempts", async () => {
    const f = fakePorts({
      devices: [device("u1", 1)],
      respond: (msgs, call) => (call === 1 ? new Error("ECONNRESET") : call === 2 ? { httpStatus: 503, tickets: [] } : { httpStatus: 200, tickets: msgs.map(() => ({ status: "ok" as const, id: "t" })) }),
    });
    expect(await sendToUsers(request(), f.ports)).toMatchObject({ accepted: 1 });
    expect(f.ports.sleep).toHaveBeenCalledTimes(2);

    const g = fakePorts({ devices: [device("u1", 1)], respond: () => ({ httpStatus: 500, tickets: [] }) });
    expect(await sendToUsers(request(), g.ports)).toMatchObject({ accepted: 0, errors: { SendFailed: 1 } });
    expect(g.calls()).toBe(3);
  });

  it("doesn't retry a 4xx rejection", async () => {
    const f = fakePorts({ devices: [device("u1", 1)], respond: () => ({ httpStatus: 400, tickets: [] }) });
    await sendToUsers(request(), f.ports);
    expect(f.calls()).toBe(1);
  });

  it("refuses an invalid request before claiming the key", async () => {
    const f = fakePorts({ devices: [device("u1", 1)] });
    expect(await sendToUsers(request({ url: "https://evil.example" }), f.ports)).toMatchObject({ status: "invalid" });
    expect(await sendToUsers(request({ idempotencyKey: " " }), f.ports)).toMatchObject({ status: "invalid" });
    expect(f.claimed.size).toBe(0);
  });
});

describe("processReceipts", () => {
  it("prunes unregistered devices and returns receipts not ready yet", async () => {
    const deleted: unknown[] = [];
    const out = await processReceipts(
      [
        { id: "r1", uid: "u1", installId: "i1" },
        { id: "r2", uid: "u1", installId: "i2" },
        { id: "r3", uid: "u2", installId: "i3" },
      ],
      {
        getReceipts: async () => ({ r1: { status: "ok" }, r2: { status: "error", details: { error: "DeviceNotRegistered" } } }),
        deleteDevices: async (list) => void deleted.push(...list),
      }
    );
    expect(out).toMatchObject({ checked: 2, pruned: 1, errors: { DeviceNotRegistered: 1 } });
    expect(out.notReady.map((p) => p.id)).toEqual(["r3"]);
    expect(deleted).toEqual([{ uid: "u1", installId: "i2" }]);
  });
});

describe("helpers", () => {
  it("latestOwnerByToken keeps the most recent device per token", () => {
    const m = latestOwnerByToken([device("a", 1, 10, { token: tok(1) }), device("b", 2, 20, { token: tok(1) })]);
    expect(m.get(tok(1))?.uid).toBe("b");
  });

  it("buildMessage clips long text and marks high-importance categories", () => {
    const msg = buildMessage(request({ category: "bills", title: "x".repeat(200), body: "y".repeat(500) }), tok(1));
    expect(msg.title.length).toBe(80);
    expect(msg.body.length).toBe(240);
    expect(msg.priority).toBe("high");
    expect(msg.channelId).toBe("credit-card-bills");
    expect(msg).not.toHaveProperty("ttl");
  });

  it("sendLogId makes a safe, bounded document id", () => {
    expect(sendLogId("ccbill:b1/due")).toBe("ccbill:b1_due");
    const long = sendLogId("k".repeat(500));
    expect(long.length).toBeLessThanOrEqual(300);
    expect(sendLogId("k".repeat(500))).toBe(long);
  });
});
