import { describe, expect, it, vi } from "vitest";

import { createFirestorePushPorts, type AdminFirestoreLike } from "./firestorePorts";

/** A tiny in-memory stand-in for the Admin Firestore surface the ports use. */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const docs = new Map(Object.entries(seed));
  const snap = (path: string) => ({
    exists: docs.has(path),
    id: path.split("/").pop()!,
    ref: { path },
    data: () => docs.get(path),
  });
  const query = (match: (path: string) => boolean, filters: [string, unknown[]][] = []): ReturnType<AdminFirestoreLike["collection"]> => ({
    where: (field, _op, value) => query(match, [...filters, [field, value as unknown[]]]),
    get: async () => ({
      docs: [...docs.keys()]
        .filter(match)
        .filter((p) => filters.every(([f, vals]) => vals.includes(docs.get(p)?.[f])))
        .map(snap),
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
      set: async (data, opts) => void docs.set(path, opts?.merge ? { ...docs.get(path), ...data } : data),
    }),
    collection: (path) => query((p) => p.startsWith(`${path}/`) && p.split("/").length === path.split("/").length + 1),
    collectionGroup: (id) => query((p) => p.split("/").at(-2) === id),
    batch: () => {
      const dels: string[] = [];
      return { delete: (ref: { path: string }) => dels.push(ref.path), commit: async () => dels.forEach((p) => docs.delete(p)) };
    },
  };
  return { db, docs };
}

const ts = (ms: number) => ({ toMillis: () => ms });
const TOKEN = "ExponentPushToken[abcDEF123456]";

describe("createFirestorePushPorts", () => {
  it("reads the kill switch", async () => {
    expect(await createFirestorePushPorts(fakeDb({}).db, { readModel: null }).killSwitchOn()).toBe(false);
    const on = fakeDb({ "pushConfig/global": { sendsDisabled: true } });
    expect(await createFirestorePushPorts(on.db, { readModel: null }).killSwitchOn()).toBe(true);
  });

  it("reads the rollout list from the same config document, once per run (SPENDLY-233)", async () => {
    const f = fakeDb({ "pushConfig/global": { sendsDisabled: false, allowUids: ["u1", 7, ""] } });
    let reads = 0;
    const get = f.db.doc;
    const db = { ...f.db, doc: (path: string) => { const ref = get(path); return { ...ref, get: async () => (reads++, ref.get()) }; } };
    const ports = createFirestorePushPorts(db, { readModel: null });
    expect(await ports.killSwitchOn()).toBe(false);
    expect(await ports.rolloutUids!()).toEqual(["u1"]);
    expect(reads).toBe(1);
    expect(await createFirestorePushPorts(fakeDb({}).db, { readModel: null }).rolloutUids!()).toBeNull();
  });

  it("claims a key once, with a 30-day expiry for the TTL policy", async () => {
    const f = fakeDb({});
    const ports = createFirestorePushPorts(f.db, { readModel: null, now: () => new Date("2026-11-06T00:00:00Z") });
    expect(await ports.claim("k1", { category: "bills", kind: "bill_due" })).toBe(true);
    expect(await ports.claim("k1", { category: "bills", kind: "bill_due" })).toBe(false);
    expect(f.docs.get("pushSendLogs/k1")).toMatchObject({ status: "sending", expireAt: new Date("2026-12-06T00:00:00Z") });
  });

  it("loads only users/{uid}/devices documents, and finds token owners across accounts", async () => {
    const f = fakeDb({
      "users/u1/devices/i1": { token: TOKEN, product: "expense", lastSeenAt: ts(5) },
      "users/u2/devices/i2": { token: TOKEN, product: "expense", lastSeenAt: ts(9) },
      "pandals/p1/devices/x": { token: TOKEN },
    });
    const ports = createFirestorePushPorts(f.db, { readModel: null });
    expect(await ports.loadDevices("u1")).toEqual([{ uid: "u1", installId: "i1", token: TOKEN, product: "expense", lastSeenAtMs: 5 }]);
    expect((await ports.findTokenOwners([TOKEN])).map((d) => d.uid).sort()).toEqual(["u1", "u2"]);
  });

  it("reads preferences through the app's own settings parser", async () => {
    const f = fakeDb({ "users/u1": { settings: { creditCardBillReminders: { enabled: false } } } });
    const prefs = await createFirestorePushPorts(f.db, { readModel: null }).loadPreferences("u1");
    expect(prefs?.creditCardBillReminders?.enabled).toBe(false);
  });

  it("prunes devices and tells the read model which paths it deleted", async () => {
    const f = fakeDb({ "users/u1/devices/i1": { token: TOKEN }, "users/u1/devices/i2": { token: TOKEN } });
    const note = vi.fn();
    await createFirestorePushPorts(f.db, { readModel: { note } }).deleteDevices([{ uid: "u1", installId: "i1" }]);
    expect(f.docs.has("users/u1/devices/i1")).toBe(false);
    expect(f.docs.has("users/u1/devices/i2")).toBe(true);
    expect(note).toHaveBeenCalledWith("u1", ["users/u1/devices/i1"]);
  });

  it("posts to Expo with the access token and returns the tickets", async () => {
    const fetch = vi.fn(async () => ({ status: 200, json: async () => ({ data: [{ status: "ok", id: "t1" }] }) }));
    const ports = createFirestorePushPorts(fakeDb({}).db, { readModel: null, fetch, expoAccessToken: "secret" });
    const res = await ports.sendExpo([{ to: TOKEN } as never]);
    expect(res).toEqual({ httpStatus: 200, tickets: [{ status: "ok", id: "t1" }] });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(init.headers.Authorization).toBe("Bearer secret");
  });

  it("returns no receipts on an HTTP error", async () => {
    const fetch = vi.fn(async () => ({ status: 500, json: async () => ({}) }));
    expect(await createFirestorePushPorts(fakeDb({}).db, { readModel: null, fetch }).getReceipts(["t1"])).toEqual({});
  });
});
