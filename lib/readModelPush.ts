import { MAX_PUSH_REFS, pushRefFromPath, pushRefKey, type PushRef } from "@/shared/utils/readModel/pushRefs";

/**
 * SPENDLY-583 — after this device saves synced documents, ask the server to
 * copy them to the read model within seconds (the nightly sync is the safety
 * net). Two hooks feed it:
 * - `notifyReadModelWrites`: `commitMutations` names every path it wrote, which
 *   covers the ledger, accounts, transfers, entries, payments, bills paid and
 *   due-posts, including documents outside the loaded window;
 * - `notifyReadModelSnapshot`: the synced collections' live listeners report
 *   this device's own unsaved changes (`hasPendingWrites`), which covers the
 *   direct writers (bills, categories, investment cash).
 *
 * The pusher de-duplicates, waits `debounceMs` so a burst of saves is one
 * request, then waits until Firestore has committed every pending write (so
 * the server reads the saved version; offline, it simply waits), and POSTs
 * the refs. It never sends data, never pushes in Spendly Test or a duress
 * session, drops anything noted for a user who has since signed out, and
 * never surfaces an error: a failed push is logged once and the nightly sync
 * repairs it.
 */
export type PushUser = { uid: string; getIdToken(): Promise<string> };

export type PusherDeps = {
  /** The function URL, or "" when the read model isn't set up in this build. */
  endpoint(): string;
  getUser(): PushUser | null;
  /** False in Spendly Test, a duress session, or a build without the read model. */
  canPush(): boolean;
  /** Resolves once Firestore has acknowledged every pending write. */
  waitForCommit(): Promise<void>;
  fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ ok: boolean; status: number }>;
  log(event: string, detail: unknown): void;
  debounceMs?: number;
};

export function createReadModelPusher(deps: PusherDeps) {
  const debounceMs = deps.debounceMs ?? 2000;
  let pending = new Map<string, PushRef>();
  let pendingUid: string | null = null;
  let userSync = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let warned = false;

  const warnOnce = (detail: unknown) => {
    if (warned) return;
    warned = true;
    deps.log("readModel.push", detail);
  };

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  }

  function accept(uid: string): boolean {
    if (!deps.canPush()) return false;
    if (pendingUid && pendingUid !== uid) {
      // A different user: whatever was noted for the previous one is dropped.
      pending = new Map();
      userSync = false;
    }
    pendingUid = uid;
    return true;
  }

  function note(uid: string, refs: PushRef[]) {
    if (!refs.length || !accept(uid)) return;
    if (!userSync) {
      for (const ref of refs) pending.set(pushRefKey(ref), ref);
      // Too many to name: one per-user changed-only sync covers them all.
      if (pending.size > MAX_PUSH_REFS) {
        userSync = true;
        pending = new Map();
      }
    }
    schedule();
  }

  function noteUserSync(uid: string) {
    if (!accept(uid)) return;
    userSync = true;
    pending = new Map();
    schedule();
  }

  async function flush(): Promise<void> {
    if (running) {
      schedule();
      return;
    }
    const refs = [...pending.values()];
    const sync = userSync;
    const uid = pendingUid;
    pending = new Map();
    userSync = false;
    if (!uid || (!sync && refs.length === 0)) return;
    running = true;
    try {
      await deps.waitForCommit();
      const user = deps.getUser();
      const url = deps.endpoint();
      if (!user || user.uid !== uid || !url || !deps.canPush()) return;
      const token = await user.getIdToken();
      const response = await deps.fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(sync ? { mode: "user" } : { refs }),
      });
      if (!response.ok && response.status !== 202) warnOnce({ status: response.status });
    } catch (error) {
      warnOnce(error);
    } finally {
      running = false;
      if (pending.size || userSync) schedule();
    }
  }

  return { note, noteUserSync, flush };
}

type Pusher = ReturnType<typeof createReadModelPusher>;
type SnapshotLike = {
  metadata: { hasPendingWrites: boolean };
  docChanges(): { type: "added" | "modified" | "removed"; doc: { ref: { path: string }; metadata: { hasPendingWrites: boolean } } }[];
};

let pusher: Pusher | null = null;
let currentUser: () => PushUser | null = () => null;

/** Called once by FinanceDataProvider: who is signed in, and whether pushing is allowed now. */
export function configureReadModelPush(input: {
  getUser: () => PushUser | null;
  canPush: () => boolean;
  endpoint: () => string;
  waitForCommit: () => Promise<void>;
  fetch: PusherDeps["fetch"];
  log: PusherDeps["log"];
}): void {
  currentUser = input.getUser;
  pusher = createReadModelPusher(input);
}

/** `commitMutations` hook: the paths it just wrote (any not synced are ignored). */
export function notifyReadModelWrites(uid: string, paths: string[]): void {
  if (!pusher) return;
  const refs = paths.map((p) => pushRefFromPath(p, uid)).filter((r): r is PushRef => r !== null);
  pusher.note(uid, refs);
}

/** Live-listener hook for a synced collection: this device's own unsaved changes. */
export function notifyReadModelSnapshot(snapshot: SnapshotLike): void {
  if (!pusher || !snapshot.metadata.hasPendingWrites) return;
  const uid = currentUser()?.uid;
  if (!uid) return;
  const refs: PushRef[] = [];
  for (const change of snapshot.docChanges()) {
    // A removed doc carries no pending flag of its own; the snapshot's says
    // this device caused it (a delete, or a window shift: pushing that is a
    // harmless re-copy).
    if (change.type === "removed" || change.doc.metadata.hasPendingWrites) {
      const ref = pushRefFromPath(change.doc.ref.path, uid);
      if (ref) refs.push(ref);
    }
  }
  pusher.note(uid, refs);
}

/** For writers that can't name their documents: a changed-only sync of this user's data. */
export function notifyReadModelChanged(uid: string): void {
  pusher?.noteUserSync(uid);
}

/** Tests only. */
export function resetReadModelPushForTests(): void {
  pusher = null;
  currentUser = () => null;
}
