/**
 * Firestore (Admin SDK) + Expo HTTP ports for the push sender (SPENDLY-227).
 *
 * Typed structurally so `shared/` takes no dependency on firebase-admin: pass
 * the Admin `Firestore` from any server runtime. Server-only paths (clients
 * are denied by firestore.rules):
 *   pushConfig/global      { sendsDisabled: boolean, allowUids?: string[] }
 *                          — the kill switch and the staged rollout (233), no deploy needed
 *   pushSendLogs/{key}     one per idempotency key, kept until `expireAt` (30 days). Spark has
 *                          no TTL policies, so the job deletes expired logs (SPENDLY-713)
 *
 * Pruning a dead token deletes `users/{uid}/devices/{installId}`, a synced
 * collection, so the caller must say how the read model hears about it
 * (SPENDLY-680): pass `readModel: createServerPush(serverPushPorts(db))` and
 * flush it after sending, or `null` only where the nightly sync is enough.
 */

import { mergeSettingsFromDoc } from "../../types/settings";
import { DEVICES_COLLECTION } from "../pushDevice";
import {
  SEND_LOG_TTL_DAYS,
  type DeviceRecord,
  type ExpoMessage,
  type ExpoReceipt,
  type ExpoTicket,
  type PushPorts,
  type SendLog,
} from "./pushSender";

export const PUSH_CONFIG_DOC = "pushConfig/global";
export const PUSH_SEND_LOGS = "pushSendLogs";
const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Firestore `in` queries accept at most 30 values. */
const IN_LIMIT = 30;

/* Minimal structural view of the Admin SDK used here. */
type Snap = { exists: boolean; id: string; ref: { path: string }; data(): Record<string, unknown> | undefined };
type QuerySnap = { docs: Snap[] };
type DocRef = {
  path: string;
  get(): Promise<Snap>;
  create(data: Record<string, unknown>): Promise<unknown>;
  set(data: Record<string, unknown>, opts?: { merge: boolean }): Promise<unknown>;
};
type Query = { where(field: string, op: string, value: unknown): Query; limit(n: number): Query; get(): Promise<QuerySnap> };
export type AdminFirestoreLike = {
  doc(path: string): DocRef;
  collection(path: string): Query;
  collectionGroup(id: string): Query;
  batch(): { delete(ref: DocRef): unknown; commit(): Promise<unknown> };
};

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

export type FirestorePushPortsOptions = {
  readModel: { note(uid: string, paths: string[]): void } | null;
  /** Optional Expo access token ("enhanced push security"). From the server's secret store. */
  expoAccessToken?: string;
  fetch?: FetchLike;
  now?: () => Date;
  log?: (line: string) => void;
};

function millis(value: unknown): number {
  if (value && typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis(): number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? value : 0;
}

function toDevice(snap: Snap): DeviceRecord | null {
  // users/{uid}/devices/{installId} only.
  const parts = snap.ref.path.split("/");
  if (parts.length !== 4 || parts[0] !== "users" || parts[2] !== DEVICES_COLLECTION) return null;
  const d = snap.data() ?? {};
  if (typeof d.token !== "string") return null;
  return {
    uid: parts[1],
    installId: parts[3],
    token: d.token,
    product: typeof d.product === "string" ? d.product : "",
    lastSeenAtMs: millis(d.lastSeenAt),
  };
}

const isAlreadyExists = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
};

export function createFirestorePushPorts(db: AdminFirestoreLike, opts: FirestorePushPortsOptions): PushPorts {
  const fetchImpl: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((line: string) => console.log(line));
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
    ...(opts.expoAccessToken ? { Authorization: `Bearer ${opts.expoAccessToken}` } : {}),
  };

  // pushConfig/global, read once per run (kill switch + rollout list).
  let config: Promise<Record<string, unknown>> | null = null;
  const readConfig = () =>
    (config ??= db
      .doc(PUSH_CONFIG_DOC)
      .get()
      .then((snap) => (snap.exists ? snap.data() ?? {} : {})));

  return {
    async killSwitchOn() {
      return (await readConfig()).sendsDisabled === true;
    },

    async rolloutUids() {
      const list = (await readConfig()).allowUids;
      return Array.isArray(list) ? list.filter((u): u is string => typeof u === "string" && u.length > 0) : null;
    },

    async claim(key, meta) {
      const at = now();
      try {
        await db.doc(`${PUSH_SEND_LOGS}/${key}`).create({
          ...meta,
          status: "sending",
          createdAt: at,
          expireAt: new Date(at.getTime() + SEND_LOG_TTL_DAYS * 86_400_000),
        });
        return true;
      } catch (error) {
        if (isAlreadyExists(error)) return false;
        throw error;
      }
    },

    async loadPreferences(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      return snap.exists ? mergeSettingsFromDoc(snap.data() ?? {}) : null;
    },

    async loadDevices(uid) {
      const snap = await db.collection(`users/${uid}/${DEVICES_COLLECTION}`).get();
      return snap.docs.map(toDevice).filter((d): d is DeviceRecord => d !== null);
    },

    async findTokenOwners(tokens) {
      const out: DeviceRecord[] = [];
      for (let i = 0; i < tokens.length; i += IN_LIMIT) {
        const snap = await db.collectionGroup(DEVICES_COLLECTION).where("token", "in", tokens.slice(i, i + IN_LIMIT)).get();
        for (const doc of snap.docs) {
          const d = toDevice(doc);
          if (d) out.push(d);
        }
      }
      return out;
    },

    async deleteDevices(devices) {
      for (let i = 0; i < devices.length; i += 400) {
        const chunk = devices.slice(i, i + 400);
        const batch = db.batch();
        for (const d of chunk) batch.delete(db.doc(`users/${d.uid}/${DEVICES_COLLECTION}/${d.installId}`));
        await batch.commit();
        const byUid = new Map<string, string[]>();
        for (const d of chunk) {
          const paths = byUid.get(d.uid) ?? [];
          paths.push(`users/${d.uid}/${DEVICES_COLLECTION}/${d.installId}`);
          byUid.set(d.uid, paths);
        }
        for (const [uid, paths] of byUid) opts.readModel?.note(uid, paths);
      }
    },

    async sendExpo(messages: readonly ExpoMessage[]) {
      const res = await fetchImpl(EXPO_SEND_URL, { method: "POST", headers, body: JSON.stringify(messages) });
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      return { httpStatus: res.status, tickets: Array.isArray(json?.data) ? json!.data! : [] };
    },

    async getReceipts(ids) {
      const res = await fetchImpl(EXPO_RECEIPTS_URL, { method: "POST", headers, body: JSON.stringify({ ids }) });
      if (res.status < 200 || res.status >= 300) return {};
      const json = (await res.json().catch(() => null)) as { data?: Record<string, ExpoReceipt> } | null;
      return json?.data && typeof json.data === "object" ? json.data : {};
    },

    async finishLog(key, entry: SendLog) {
      // `receiptsPending` lets the next runs find logs with receipts to read
      // through a single-field equality query (SPENDLY-692).
      await db
        .doc(`${PUSH_SEND_LOGS}/${key}`)
        .set({ ...entry, status: "done", finishedAt: now(), receiptsPending: entry.pendingReceipts.length > 0 }, { merge: true });
    },

    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log,
  };
}
