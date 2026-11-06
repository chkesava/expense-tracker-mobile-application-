/**
 * The shared server-side push sender (SPENDLY-227, epic SPENDLY-222).
 *
 * One way for every Spendly feature to notify a set of users through the Expo
 * Push Service (docs/PUSH_CREDENTIALS.md). Runtime-agnostic: all I/O goes
 * through `PushPorts`, so Cloud Functions, Netlify and GitHub Actions scripts
 * can all call it (see firestorePorts.ts for the Firestore + Expo ports).
 *
 * Guarantees:
 * - **Kill switch:** nothing is sent while `pushConfig/global.sendsDisabled`.
 * - **Idempotent:** the same `idempotencyKey` is sent at most once (claimed
 *   before sending), so a trigger or cron retry can't notify twice.
 * - **Right people only:** the actor and duress uids are dropped; each user's
 *   preferences are honoured; only Spendly (`product: "expense"`) devices with
 *   a valid Expo token are used; a token registered under several accounts
 *   (a session that ended elsewhere couldn't delete its device document) goes
 *   only to the account that used it most recently.
 * - **Small, private payload:** `data = { product, category, kind, url, entityId }`.
 *   Callers decide the wording; amounts belong only where the user allowed them.
 * - **Dead tokens pruned:** `DeviceNotRegistered` (ticket or receipt) deletes
 *   that device document. Retryable failures back off and are capped.
 * - **Logged without tokens** in `pushSendLogs/{key}`, kept for 30 days.
 */

import { isDuressUid } from "../duress";
import { PUSH_CHANNELS, isPushCategoryEnabled, type PushCategory, type PushPreferenceSource } from "../pushPreferences";
import { isExpoPushToken } from "../pushDevice";

export const EXPO_CHUNK = 100;
export const MAX_SEND_ATTEMPTS = 3;
export const SEND_LOG_TTL_DAYS = 30;
const MAX_TITLE = 80;
const MAX_BODY = 240;

export type PushRequest = {
  uids: readonly string[];
  category: PushCategory;
  /** Short machine name, e.g. "bill_due", "sip_failed". */
  kind: string;
  title: string;
  body: string;
  /** In-app route the tap opens; must start with "/". */
  url: string;
  entityId: string;
  /** Same key → sent at most once. Built by the caller from the event, e.g. `ccbill:{billId}:due`. */
  idempotencyKey: string;
  /** Who caused it; never notified about their own action. */
  actorUid?: string;
  /** Seconds the push may wait for an offline device (e.g. until the end of the slot day). */
  ttlSeconds?: number;
};

export type DeviceRecord = { uid: string; installId: string; token: string; product: string; lastSeenAtMs: number };

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { product: "expense"; category: PushCategory; kind: string; url: string; entityId: string };
  channelId: string;
  priority: "default" | "high";
  sound: "default";
  ttl?: number;
};

export type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };
export type ExpoReceipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

/** A sent push whose receipt is still to be read, by device (never the token). */
export type PendingReceipt = { id: string; uid: string; installId: string };

export type SendLog = {
  category: PushCategory;
  kind: string;
  recipients: number;
  optedOut: number;
  noDevice: number;
  messages: number;
  accepted: number;
  pruned: number;
  errors: Record<string, number>;
  pendingReceipts: PendingReceipt[];
};

export interface PushPorts {
  killSwitchOn(): Promise<boolean>;
  /** Creates the log entry for `key`; false if it already exists (already sent). */
  claim(key: string, meta: { category: PushCategory; kind: string }): Promise<boolean>;
  loadPreferences(uid: string): Promise<PushPreferenceSource | null>;
  loadDevices(uid: string): Promise<DeviceRecord[]>;
  /** Every device, any user, registered with one of these tokens. */
  findTokenOwners(tokens: readonly string[]): Promise<DeviceRecord[]>;
  deleteDevices(devices: readonly Pick<DeviceRecord, "uid" | "installId">[]): Promise<void>;
  sendExpo(messages: readonly ExpoMessage[]): Promise<{ httpStatus: number; tickets: ExpoTicket[] }>;
  getReceipts(ids: readonly string[]): Promise<Record<string, ExpoReceipt>>;
  finishLog(key: string, log: SendLog): Promise<void>;
  sleep(ms: number): Promise<void>;
  log?(line: string): void;
}

export type SendResult =
  | { status: "disabled" | "duplicate" }
  | { status: "invalid"; reason: string }
  | ({ status: "sent" } & Omit<SendLog, "pendingReceipts" | "category" | "kind">);

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Firestore document id for an idempotency key (no "/", bounded length). */
export function sendLogId(idempotencyKey: string): string {
  const safe = idempotencyKey.replace(/[^A-Za-z0-9:_.-]/g, "_");
  if (safe.length <= 300) return safe;
  let h = 0;
  for (const ch of idempotencyKey) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return `${safe.slice(0, 280)}~${(h >>> 0).toString(36)}`;
}

export function validateRequest(req: PushRequest): string | null {
  if (!req.idempotencyKey.trim()) return "idempotencyKey is required";
  if (!req.title.trim() || !req.body.trim()) return "title and body are required";
  if (!req.url.startsWith("/") || req.url.startsWith("//")) return "url must be an in-app path";
  if (!req.entityId) return "entityId is required";
  if (!(req.category in PUSH_CHANNELS)) return "unknown category";
  return null;
}

/**
 * Keeps, for each token, only the device of the account that used it last
 * (ties: the earliest uid, so the choice is stable).
 */
export function latestOwnerByToken(devices: readonly DeviceRecord[]): Map<string, DeviceRecord> {
  const best = new Map<string, DeviceRecord>();
  for (const d of devices) {
    const cur = best.get(d.token);
    if (!cur || d.lastSeenAtMs > cur.lastSeenAtMs || (d.lastSeenAtMs === cur.lastSeenAtMs && d.uid < cur.uid)) {
      best.set(d.token, d);
    }
  }
  return best;
}

export function buildMessage(req: PushRequest, token: string): ExpoMessage {
  const channel = PUSH_CHANNELS[req.category];
  return {
    to: token,
    title: clip(req.title.trim(), MAX_TITLE),
    body: clip(req.body.trim(), MAX_BODY),
    data: { product: "expense", category: req.category, kind: req.kind, url: req.url, entityId: req.entityId },
    channelId: channel.id,
    priority: channel.importance === "high" ? "high" : "default",
    sound: "default",
    ...(req.ttlSeconds && req.ttlSeconds > 0 ? { ttl: Math.floor(req.ttlSeconds) } : {}),
  };
}

const errorCode = (r: { message?: string; details?: { error?: string } }) => r.details?.error ?? "Unknown";

/** Sends one chunk, retrying the whole request on 429/5xx or a network failure. */
async function sendChunk(ports: PushPorts, chunk: readonly ExpoMessage[]): Promise<ExpoTicket[] | null> {
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const { httpStatus, tickets } = await ports.sendExpo(chunk);
      if (httpStatus >= 200 && httpStatus < 300 && tickets.length === chunk.length) return tickets;
      if (httpStatus !== 429 && httpStatus < 500) {
        ports.log?.(`[PUSH] Expo rejected a chunk (HTTP ${httpStatus})`);
        return null;
      }
    } catch (error) {
      ports.log?.(`[PUSH] send attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (attempt < MAX_SEND_ATTEMPTS) await ports.sleep(1000 * 2 ** (attempt - 1));
  }
  return null;
}

export async function sendToUsers(req: PushRequest, ports: PushPorts): Promise<SendResult> {
  const invalid = validateRequest(req);
  if (invalid) return { status: "invalid", reason: invalid };
  if (await ports.killSwitchOn()) return { status: "disabled" };

  const key = sendLogId(req.idempotencyKey);
  if (!(await ports.claim(key, { category: req.category, kind: req.kind }))) return { status: "duplicate" };

  const log: SendLog = {
    category: req.category,
    kind: req.kind,
    recipients: 0,
    optedOut: 0,
    noDevice: 0,
    messages: 0,
    accepted: 0,
    pruned: 0,
    errors: {},
    pendingReceipts: [],
  };
  const bump = (code: string, n = 1) => (log.errors[code] = (log.errors[code] ?? 0) + n);

  const uids = [...new Set(req.uids)].filter((u) => u && u !== req.actorUid && !isDuressUid(u));
  log.recipients = uids.length;

  // Each recipient's own Spendly devices, if they want this category.
  const candidates: DeviceRecord[] = [];
  for (const uid of uids) {
    const prefs = (await ports.loadPreferences(uid)) ?? {};
    if (!isPushCategoryEnabled(prefs, req.category)) {
      log.optedOut++;
      continue;
    }
    const devices = (await ports.loadDevices(uid)).filter(
      (d) => d.uid === uid && d.product === "expense" && isExpoPushToken(d.token)
    );
    if (!devices.length) log.noDevice++;
    candidates.push(...devices);
  }

  // A token goes only to the account that used it last, across all accounts.
  const owners = latestOwnerByToken([...candidates, ...(await ports.findTokenOwners([...new Set(candidates.map((d) => d.token))]))]);
  const targets = [...latestOwnerByToken(candidates).values()].filter((d) => {
    const owner = owners.get(d.token);
    return owner?.uid === d.uid && owner.installId === d.installId;
  });

  const prune: Pick<DeviceRecord, "uid" | "installId">[] = [];
  for (let i = 0; i < targets.length; i += EXPO_CHUNK) {
    const devices = targets.slice(i, i + EXPO_CHUNK);
    const messages = devices.map((d) => buildMessage(req, d.token));
    log.messages += messages.length;
    const tickets = await sendChunk(ports, messages);
    if (!tickets) {
      bump("SendFailed", messages.length);
      continue;
    }
    tickets.forEach((t, j) => {
      const device = devices[j];
      if (t.status === "ok") {
        log.accepted++;
        log.pendingReceipts.push({ id: t.id, uid: device.uid, installId: device.installId });
      } else {
        const code = errorCode(t);
        bump(code);
        if (code === "DeviceNotRegistered") prune.push({ uid: device.uid, installId: device.installId });
      }
    });
  }

  if (prune.length) {
    await ports.deleteDevices(prune);
    log.pruned = prune.length;
  }
  await ports.finishLog(key, log);
  const { pendingReceipts: _p, category: _c, kind: _k, ...counts } = log;
  return { status: "sent", ...counts };
}

/**
 * Reads the receipts of earlier sends (Expo has them ~15 minutes later and
 * keeps them about a day) and prunes devices Expo reports as unregistered.
 * Returns the receipts still not ready, to try again on the next run.
 */
export async function processReceipts(
  pending: readonly PendingReceipt[],
  ports: Pick<PushPorts, "getReceipts" | "deleteDevices" | "log">
): Promise<{ checked: number; pruned: number; errors: Record<string, number>; notReady: PendingReceipt[] }> {
  const out = { checked: 0, pruned: 0, errors: {} as Record<string, number>, notReady: [] as PendingReceipt[] };
  const prune: Pick<DeviceRecord, "uid" | "installId">[] = [];
  for (let i = 0; i < pending.length; i += 1000) {
    const batch = pending.slice(i, i + 1000);
    const receipts = await ports.getReceipts(batch.map((p) => p.id));
    for (const p of batch) {
      const r = receipts[p.id];
      if (!r) {
        out.notReady.push(p);
        continue;
      }
      out.checked++;
      if (r.status === "error") {
        const code = errorCode(r);
        out.errors[code] = (out.errors[code] ?? 0) + 1;
        if (code === "DeviceNotRegistered") prune.push({ uid: p.uid, installId: p.installId });
      }
    }
  }
  if (prune.length) {
    await ports.deleteDevices(prune);
    out.pruned = prune.length;
  }
  return out;
}
