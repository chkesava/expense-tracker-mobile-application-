/**
 * SPENDLY-742 (epic SPENDLY-735: the app only delivers) — the category
 * taxonomy upgrade, run by the server instead of on app launch. An upgrade
 * (a new shipped taxonomy) re-reads every category and remaps every expense,
 * budget, rule, subscription and trip: a full-ledger burst the phone used to
 * do at sign-in. The migration itself is shared and unchanged
 * (shared/data/categoryHierarchyMigration.ts); this file selects whose stamp
 * is behind and runs it through an Admin SDK adapter.
 *
 * New users are still seeded by the app (no stamp yet), so their first
 * categories never wait for this job.
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { trackServerBatch } from "../../netlify/functions/_readmodelServerPush";
import { hierarchyStampIsCurrent, taxonomyFingerprint } from "../../shared/data/categoryHierarchyPlan";
import {
  CATEGORY_HIERARCHY_VERSION,
  HIERARCHY_FLAG,
  TAXONOMY_FINGERPRINT_FLAG,
  runCategoryMigration,
  type CategoryMigrationEnv,
} from "../../shared/data/categoryHierarchyMigration";
import { isDuressUid } from "../../shared/utils/duress";
import { bump, newJobSummary, type DailyJobSummary, type JobPush } from "./dailyJobCore";
import type { ReadBudget } from "./pushRunCore";

/** Users whose `meta/categories` stamp is behind the shipped taxonomy (no stamp = not ours: the app seeds). */
export function staleCategoryUsers(metaDocs: Array<{ uid: string; data: Record<string, unknown> }>): string[] {
  const current = { version: CATEGORY_HIERARCHY_VERSION, fingerprint: taxonomyFingerprint() };
  return metaDocs
    .filter(({ uid }) => uid && !isDuressUid(uid))
    .filter(({ data }) => !hierarchyStampIsCurrent({ version: data[HIERARCHY_FLAG] as number | undefined, fingerprint: data[TAXONOMY_FINGERPRINT_FLAG] }, current))
    .map(({ uid }) => uid);
}

/** The shared migration's Firestore functions on the Admin SDK; reads are charged to `charge`. */
export function adminCategoryEnv(db: Firestore, charge: (n: number) => void, noteWrites: (paths: string[]) => void = () => undefined): CategoryMigrationEnv {
  return {
    db,
    collection: (_db, ...path) => db.collection(path.join("/")),
    doc: (parent, ...path) => {
      if (path.length === 0) return parent.doc(); // auto id, as the client's doc(collectionRef)
      return parent === db ? db.doc(path.join("/")) : parent.doc(path.join("/"));
    },
    getDoc: async (ref) => {
      const snap = await ref.get();
      charge(1);
      return { exists: () => snap.exists, data: () => snap.data() };
    },
    getDocs: async (ref) => {
      const snap = await ref.get();
      charge(snap.size);
      return {
        docs: snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, ref: d.ref, data: () => d.data() })),
        metadata: { fromCache: false },
      };
    },
    setDoc: (ref, data, options) => (options?.merge ? ref.set(data, { merge: true }) : ref.set(data)),
    writeBatch: () => db.batch(),
    trackedBatch: (batch) => trackServerBatch(batch),
    increment: (n) => FieldValue.increment(n),
    serverTimestamp: () => FieldValue.serverTimestamp(),
    noteDirectWrites: (_uid, paths) => noteWrites(paths),
  };
}

export async function runCategoryDaily(opts: {
  /** Every `meta/categories` doc, with its owner. */
  metaDocs: Array<{ uid: string; data: Record<string, unknown> }>;
  /** Runs the shared migration for one user; returns the paths it wrote. */
  upgrade(uid: string): Promise<{ outcome: string; written: string[] }>;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
}): Promise<DailyJobSummary> {
  const summary = newJobSummary("category-daily", opts.dryRun);
  const stale = staleCategoryUsers(opts.metaDocs);
  bump(summary, "stampsChecked", opts.metaDocs.length);
  bump(summary, "usersBehind", stale.length);
  if (opts.dryRun) return summary;
  for (const uid of stale) {
    if (opts.budget.exhausted()) break;
    summary.usersSeen += 1;
    try {
      const { outcome, written } = await opts.upgrade(uid);
      bump(summary, `outcome_${outcome}`);
      bump(summary, "docsWritten", written.length);
      summary.writes.written += written.length;
      opts.push?.note(uid, written);
    } catch (error) {
      // What it committed before failing still goes to the read model (SPENDLY-730).
      const partial = (error as { written?: string[] })?.written;
      if (partial?.length) opts.push?.note(uid, partial);
      // The message can name a document path (a uid); the log is public, so the code only.
      const code = (error as { code?: unknown })?.code ?? (error instanceof Error ? error.name : "error");
      summary.writes.failed += 1;
      summary.failures.push(`category upgrade failed (${String(code)})`);
    }
  }
  return summary;
}

/**
 * One user's upgrade on the Admin SDK: the shared migration. Every written
 * path is collected, also when it fails part-way (SPENDLY-730), and returned
 * on the error for the push.
 */
export async function upgradeUser(db: Firestore, uid: string, charge: (n: number) => void): Promise<{ outcome: string; written: string[] }> {
  const written: string[] = [];
  try {
    const outcome = await runCategoryMigration(adminCategoryEnv(db, charge, (paths) => written.push(...paths)), uid, { upgradeExisting: true });
    return { outcome, written };
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { written });
  }
}
