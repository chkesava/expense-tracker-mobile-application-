import { isDuressUid } from "../../shared/utils/duress";
import { MAX_PUSH_REFS, pushRefFromPath, pushRefKey, type PushRef } from "../../shared/utils/readModel/pushRefs";
import { copyDocsToReadModel, type PushPorts } from "./_readmodelPushCore";

/**
 * SPENDLY-680 — server-side writers (the EPF cron, admin scripts) copy what
 * they just wrote to the read model, as the app's saves do (583/670), so a
 * screen reading Supabase sees a cron's change within seconds instead of
 * after the nightly sync.
 *
 * Best effort, always: it runs after Firestore committed, never throws, and
 * whatever it misses the nightly sync copies (Firestore stays the source).
 * Duress trees and erased accounts are never copied.
 */
export type ServerPushPorts = Pick<PushPorts, "readDocs" | "upsert" | "tombstone" | "isPurged"> & {
  log?(line: string): void;
};

export type ServerPushResult = { pushed: number; tombstoned: number; failed: number; skipped: string | null };

export function createServerPush(ports: ServerPushPorts | null) {
  const pending = new Map<string, Map<string, PushRef>>();

  return {
    /** After a commit: the paths it wrote (`users/{uid}/…`). Not synced paths are ignored. */
    note(uid: string, paths: Iterable<string>) {
      if (!uid || isDuressUid(uid)) return;
      const refs = pending.get(uid) ?? new Map<string, PushRef>();
      for (const path of paths) {
        const ref = pushRefFromPath(path, uid);
        if (ref) refs.set(pushRefKey(ref), ref);
      }
      if (refs.size) pending.set(uid, refs);
    },

    /** Copies everything noted so far. Never throws. */
    async flush(): Promise<ServerPushResult> {
      const result: ServerPushResult = { pushed: 0, tombstoned: 0, failed: 0, skipped: null };
      if (!ports) {
        const docs = [...pending.values()].reduce((n, m) => n + m.size, 0);
        pending.clear();
        return { ...result, skipped: docs ? "read model not configured: the nightly sync copies these" : null };
      }
      const work = [...pending.entries()];
      pending.clear();
      for (const [uid, refs] of work) {
        try {
          if (await ports.isPurged(uid)) continue;
          const list = [...refs.values()];
          for (let i = 0; i < list.length; i += MAX_PUSH_REFS) {
            const copied = await copyDocsToReadModel(uid, list.slice(i, i + MAX_PUSH_REFS), ports);
            result.pushed += copied.pushed;
            result.tombstoned += copied.tombstoned;
          }
        } catch (error) {
          result.failed += refs.size;
          ports.log?.(`[SERVER PUSH] failed for one account (${refs.size} docs): ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return result;
    },
  };
}

/**
 * Records the paths a Firestore admin batch writes, like the app's
 * `trackedBatch`: `set`, `update`, `create` and `delete` pass through.
 */
export function trackServerBatch<B extends object>(batch: B): B & { writtenPaths(): string[] } {
  const paths = new Set<string>();
  return new Proxy(batch, {
    get(target, prop, receiver) {
      if (prop === "writtenPaths") return () => [...paths];
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "set" || prop === "update" || prop === "create" || prop === "delete") {
        return (ref: { path: string }, ...rest: unknown[]) => {
          paths.add(ref.path);
          return (value as (...args: unknown[]) => unknown).call(target, ref, ...rest);
        };
      }
      return (value as (...args: unknown[]) => unknown).bind(target);
    },
  }) as B & { writtenPaths(): string[] };
}
