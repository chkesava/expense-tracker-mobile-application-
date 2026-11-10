import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
  writeBatch,
  serverTimestamp,
  type Firestore,
} from "@/lib/firestore";
import { logDirectRead } from "@/lib/firestoreReadDebug";
import { noteDirectWrites, trackedBatch } from "@/lib/readModelWriteHooks";
import {
  runCategoryMigration,
  type CategoryMigrationEnv,
  type CategoryMigrationOutcome,
} from "@/shared/data/categoryHierarchyMigration";

export { CATEGORY_HIERARCHY_VERSION } from "@/shared/data/categoryHierarchyMigration";

const inFlightByUid = new Map<string, Promise<CategoryMigrationOutcome>>();

function clientEnv(db: Firestore): CategoryMigrationEnv {
  return {
    db,
    collection: collection as CategoryMigrationEnv["collection"],
    doc: doc as CategoryMigrationEnv["doc"],
    getDoc: getDoc as CategoryMigrationEnv["getDoc"],
    getDocs: getDocs as CategoryMigrationEnv["getDocs"],
    setDoc: setDoc as CategoryMigrationEnv["setDoc"],
    writeBatch: writeBatch as CategoryMigrationEnv["writeBatch"],
    trackedBatch: trackedBatch as CategoryMigrationEnv["trackedBatch"],
    increment,
    serverTimestamp,
    logDirectRead,
    noteDirectWrites,
  };
}

/**
 * Seeds a new user's Category → Subcategory docs. Safe to call on every login:
 * a current version + taxonomy fingerprint in `meta/categories` returns after
 * one doc read (SPENDLY-501).
 *
 * SPENDLY-742 (epic SPENDLY-735): an existing user whose stamp is behind (a
 * taxonomy upgrade, which remaps every expense) is no longer migrated on the
 * phone; the server's category-daily job runs the same migration
 * (shared/data/categoryHierarchyMigration.ts) and returns `deferred` here.
 */
export async function ensureCategoryHierarchy(
  db: Firestore,
  uid: string,
  options: { upgradeExisting: boolean } = { upgradeExisting: false }
): Promise<CategoryMigrationOutcome> {
  const pending = inFlightByUid.get(uid);
  if (pending) return pending;
  const work = ensureOnce(db, uid, options).finally(() => {
    inFlightByUid.delete(uid);
  });
  inFlightByUid.set(uid, work);
  return work;
}

async function ensureOnce(db: Firestore, uid: string, options: { upgradeExisting: boolean }): Promise<CategoryMigrationOutcome> {
  return runCategoryMigration(clientEnv(db), uid, options);
}
