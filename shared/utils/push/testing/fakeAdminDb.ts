/**
 * Test helper: an in-memory stand-in for the Admin Firestore surface the push
 * ports and reminder sources use (doc get/create/set, collection and
 * collection-group queries with ==, in, >=, <=, <, >, and batch deletes).
 */

import type { AdminFirestoreLike } from "../firestorePorts";
import type { DeviceRecord, ExpoMessage, PushPorts } from "../pushSender";

type Filter = [string, string, unknown];

/** Dates, Timestamps and numbers compare as milliseconds; everything else as text. */
function comparable(v: unknown): string | number {
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as { toMillis(): number }).toMillis();
  return typeof v === "number" ? v : String(v);
}

function matches(raw: unknown, op: string, rawX: unknown): boolean {
  if (op === "in") return (rawX as unknown[]).includes(raw);
  if (op === "==") return raw === rawX;
  if (raw === undefined) return false;
  const value = comparable(raw);
  const x = comparable(rawX);
  switch (op) {
    case ">=":
      return value >= x;
    case "<=":
      return value <= x;
    case "<":
      return value < x;
    case ">":
      return value > x;
    default:
      return false;
  }
}

/** A field by its Firestore path, e.g. "reminders.frequency". */
function fieldAt(data: Record<string, unknown> | undefined, path: string): unknown {
  return path.split(".").reduce<unknown>((v, key) => (v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined), data);
}

export function fakeAdminDb(seed: Record<string, Record<string, unknown>>) {
  const docs = new Map(Object.entries(seed));
  const snap = (path: string) => ({ exists: docs.has(path), id: path.split("/").pop()!, ref: { path }, data: () => docs.get(path) });
  const query = (match: (p: string) => boolean, filters: Filter[] = []): ReturnType<AdminFirestoreLike["collection"]> => ({
    where: (f, op, v) => query(match, [...filters, [f, op, v]]),
    get: async () => ({
      docs: [...docs.keys()].filter(match).filter((p) => filters.every(([f, op, v]) => matches(fieldAt(docs.get(p), f), op, v))).map(snap),
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

/** Push ports that "send" in memory to one Spendly device per uid. */
export function memoryPushPorts(uids: readonly string[]) {
  const sent: ExpoMessage[] = [];
  const claimed = new Set<string>();
  const devices: DeviceRecord[] = uids.map((uid) => ({ uid, installId: `i-${uid}`, token: `ExponentPushToken[tok-${uid}-0000]`, product: "expense", lastSeenAtMs: 1 }));
  const ports: PushPorts = {
    killSwitchOn: async () => false,
    claim: async (k) => (claimed.has(k) ? false : (claimed.add(k), true)),
    loadPreferences: async () => null,
    loadDevices: async (uid) => devices.filter((d) => d.uid === uid),
    findTokenOwners: async (tokens) => devices.filter((d) => tokens.includes(d.token)),
    deleteDevices: async () => undefined,
    sendExpo: async (m) => (sent.push(...m), { httpStatus: 200, tickets: m.map(() => ({ status: "ok" as const, id: "t" })) }),
    getReceipts: async () => ({}),
    finishLog: async () => undefined,
    sleep: async () => undefined,
  };
  return { ports, sent, claimed };
}
