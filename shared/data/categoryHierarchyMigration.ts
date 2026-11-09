/**
 * SPENDLY-742 (epic SPENDLY-735) — the category taxonomy migration, without a
 * client SDK import, so the app (new-user seeding) and the server's
 * category-daily job (upgrades) run the same code. The Firestore functions
 * come in as `env`: the app binds `@/lib/firestore` and its read-model hooks
 * (lib/ensureCategoryHierarchy.ts); the server binds an Admin SDK adapter.
 * Moved unchanged from lib/ensureCategoryHierarchy.ts (SPENDLY-501/660/712/730).
 */
import { CATEGORIES_REVISION_FIELD } from "../utils/categoryRevision";
import { CATEGORY_TAXONOMY, V1_PARENT_MAP, mapToV4Category } from "./categoryTaxonomy";
import {
  FIRESTORE_WRITE_BATCH_LIMIT,
  hierarchyStampIsCurrent,
  planDefaultTaxonomyUpsert,
  shouldFlushBatch,
  taxonomyDocsNeedUpsert,
  taxonomyFingerprint,
  type PlannedCategoryDoc,
} from "./categoryHierarchyPlan";

/* eslint-disable @typescript-eslint/no-explicit-any -- the two SDKs' ref types differ; env keeps them opaque. */
export type MigrationRef = any;

export type MigrationBatch = {
  set(ref: any, data: any, options?: { merge?: boolean }): unknown;
  update(ref: any, data: any): unknown;
  delete(ref: any): unknown;
  commit(): Promise<unknown>;
  writtenPaths(): string[];
};

export type CategoryMigrationEnv = {
  db: any;
  collection(db: any, ...path: string[]): any;
  doc(parent: any, ...path: string[]): any;
  getDoc(ref: any): Promise<{ exists(): boolean; data(): any }>;
  getDocs(ref: any): Promise<{ docs: Array<{ id: string; ref: any; data(): any }>; metadata: { fromCache: boolean } }>;
  setDoc(ref: any, data: any, options?: { merge?: boolean }): Promise<unknown>;
  writeBatch(db: any): any;
  trackedBatch(batch: any): MigrationBatch;
  increment(n: number): unknown;
  serverTimestamp(): unknown;
  logDirectRead?(path: string, count: number, source: "cache" | "server", info: Record<string, unknown>): void;
  /** Announces what was written: the app's read-model hook, or the server push. */
  noteDirectWrites(uid: string, paths: string[]): void;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const HIERARCHY_FLAG = "categoryHierarchyVersion";
export const TAXONOMY_FINGERPRINT_FLAG = "taxonomyFingerprint";
export const CATEGORY_HIERARCHY_VERSION = 4;

type CategoryDoc = PlannedCategoryDoc;

function mappedEquals(
  currentCategory: unknown,
  currentSubcategory: unknown,
  mapped: { category: string; subcategory: string }
): boolean {
  return currentCategory === mapped.category && currentSubcategory === mapped.subcategory;
}

/**
 * The migration with its announcement. SPENDLY-712: every document it commits
 * is announced to the read model; SPENDLY-730: in `finally`, so the batches
 * committed before a failure are announced too (a retry finds them correct).
 */
export async function runCategoryMigration(
  env: CategoryMigrationEnv,
  uid: string,
  options: { upgradeExisting: boolean }
): Promise<CategoryMigrationOutcome> {
  const written = new Set<string>();
  try {
    return await migrateCategoryHierarchy(env, uid, written, options);
  } finally {
    env.noteDirectWrites(uid, [...written]);
  }
}

export type CategoryMigrationOutcome = "current" | "deferred" | "migrated";

/**
 * SPENDLY-742: `upgradeExisting: false` (the app) seeds a new user's defaults
 * and returns `deferred` for an existing user whose stamp is behind; the
 * server's category-daily job runs with `upgradeExisting: true`.
 */
export async function migrateCategoryHierarchy(
  env: CategoryMigrationEnv,
  uid: string,
  written: Set<string>,
  options: { upgradeExisting: boolean } = { upgradeExisting: true }
): Promise<CategoryMigrationOutcome> {
  const db = env.db;
  const { doc, collection } = env;
  const metaRef = doc(db, "users", uid, "meta", "categories");
  const metaSnap = await env.getDoc(metaRef);
  const meta = metaSnap.exists() ? metaSnap.data() : undefined;
  const currentVersion = meta?.[HIERARCHY_FLAG] as number | undefined;
  const version = currentVersion ?? 0;

  // SPENDLY-501: an unchanged stamp means the defaults were already upserted
  // against this exact taxonomy, so skip the full categories read (~287 docs
  // on every login before this).
  if (
    hierarchyStampIsCurrent(
      { version: currentVersion, fingerprint: meta?.[TAXONOMY_FINGERPRINT_FLAG] },
      { version: CATEGORY_HIERARCHY_VERSION, fingerprint: taxonomyFingerprint() }
    )
  ) {
    return "current";
  }

  // SPENDLY-742: an existing user's upgrade runs on the server (category-daily),
  // not on app launch. A new user (no stamp yet) is still seeded here.
  if (meta && !options.upgradeExisting) return "deferred";

  const categoriesSnap = await env.getDocs(collection(db, "users", uid, "categories"));
  env.logDirectRead?.(
    `users/${uid}/categories`,
    categoriesSnap.docs.length,
    categoriesSnap.metadata.fromCache ? "cache" : "server",
    { feature: "categoryHierarchy", queryShape: "categories" }
  );
  const existing: CategoryDoc[] = categoriesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CategoryDoc, "id">),
  }));
  const needsDocs = taxonomyDocsNeedUpsert(existing);

  const hasHierarchy = existing.some(
    (c) => c.kind === "subcategory" || (c.parentId != null && c.parentId !== "")
  );

  if (version >= CATEGORY_HIERARCHY_VERSION && !needsDocs) {
    // Already correct, but stamped before fingerprints existed: stamp it so
    // the next login takes the early exit above.
    await stampVersion(env, uid);
    return "migrated";
  }

  if (version === 0 && existing.length === 0) {
    await upsertDefaultTaxonomy(env, uid, [], written);
    await stampVersion(env, uid);
    return "migrated";
  }

  if (version < 2 && !hasHierarchy) {
    const writer = createBatchWriter(env, written);
    for (const old of existing) {
      writer.delete(doc(db, "users", uid, "categories", old.id));
      await writer.maybeFlush();
    }
    await writer.flush();
    await upsertDefaultTaxonomy(env, uid, [], written);
    await remapAllNamedPairsToV4(env, uid, written);
    await stampVersion(env, uid);
    return "migrated";
  }

  await upsertDefaultTaxonomy(env, uid, existing, written);
  await reparentCustomSubsOntoMappedParents(env, uid, written);
  await remapAllNamedPairsToV4(env, uid, written);
  await stampVersion(env, uid);
  return "migrated";
}

/**
 * Every path that writes categories ends here, after its batches committed.
 * SPENDLY-660: the same write bumps the categories revision, so devices
 * loading categories by revision reload them.
 * SPENDLY-712: the read model gets exactly the documents written (the client
 * outbox, and the server push in chunks), not a per-user sync: that sync
 * timed out on Netlify for a 417-document taxonomy upgrade. They are announced
 * by ensureCategoryHierarchyOnce once the run ends (SPENDLY-730).
 */
async function stampVersion(env: CategoryMigrationEnv, uid: string) {
  const db = env.db;
  const { doc } = env;
  const { increment } = env;
  await env.setDoc(
    doc(db, "users", uid, "meta", "categories"),
    {
      [HIERARCHY_FLAG]: CATEGORY_HIERARCHY_VERSION,
      [TAXONOMY_FINGERPRINT_FLAG]: taxonomyFingerprint(),
      migratedAt: env.serverTimestamp(),
      [CATEGORIES_REVISION_FIELD]: increment(1),
      categoriesRevisedAt: env.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Batches writes; each committed batch's paths are added to `written`. */
function createBatchWriter(env: CategoryMigrationEnv, written: Set<string>) {
  const db = env.db;
  let batch: MigrationBatch = env.trackedBatch(env.writeBatch(db));
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    for (const path of batch.writtenPaths()) written.add(path);
    batch = env.trackedBatch(env.writeBatch(db));
    ops = 0;
  };

  const withoutUndefined = (data: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    );

  return {
    set(
      ref: MigrationRef,
      data: Record<string, unknown>,
      merge = false
    ) {
      const payload = withoutUndefined(data);
      if (merge) batch.set(ref, payload, { merge: true });
      else batch.set(ref, payload);
      ops++;
    },
    update(ref: MigrationRef, data: Record<string, unknown>) {
      batch.update(ref, data);
      ops++;
    },
    delete(ref: MigrationRef) {
      batch.delete(ref);
      ops++;
    },
    async maybeFlush() {
      if (shouldFlushBatch(ops, FIRESTORE_WRITE_BATCH_LIMIT)) await flush();
    },
    flush,
  };
}

type BatchWriter = ReturnType<typeof createBatchWriter>;

async function upsertDefaultTaxonomy(
  env: CategoryMigrationEnv,
  uid: string,
  existing: CategoryDoc[],
  written: Set<string>
): Promise<void> {
  const db = env.db;
  const { doc, collection } = env;
  const plan = planDefaultTaxonomyUpsert(existing, CATEGORY_TAXONOMY);
  const allocated = new Map<string, string>();
  const writer = createBatchWriter(env, written);

  const resolveId = (id: string) => {
    if (!id.startsWith("new:")) return id;
    const already = allocated.get(id);
    if (already) return already;
    const next = doc(collection(db, "users", uid, "categories")).id;
    allocated.set(id, next);
    return next;
  };

  for (const write of plan.writes) {
    if (write.op === "create") {
      const id = resolveId(write.id);
      const parentId =
        write.data.parentId == null ? null : resolveId(write.data.parentId);
      writer.set(doc(db, "users", uid, "categories", id), {
        name: write.data.name,
        kind: write.data.kind,
        parentId,
        icon: write.data.icon ?? null,
        semanticKey: write.data.semanticKey,
        isDefault: true,
        isArchived: false,
        isHidden: write.data.isHidden,
        sortOrder: write.data.sortOrder,
        createdAt: env.serverTimestamp(),
      });
    } else if (write.op === "update") {
      const parentId =
        write.data.parentId == null || write.data.parentId === undefined
          ? undefined
          : resolveId(write.data.parentId);
      writer.set(
        doc(db, "users", uid, "categories", write.id),
        {
          name: write.data.name,
          semanticKey: write.data.semanticKey,
          isHidden: write.data.isHidden,
          isArchived: false,
          sortOrder: write.data.sortOrder,
          ...(write.data.icon !== undefined ? { icon: write.data.icon } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
          updatedAt: env.serverTimestamp(),
        },
        true
      );
    } else {
      writer.set(
        doc(db, "users", uid, "categories", write.id),
        { isArchived: true, updatedAt: env.serverTimestamp() },
        true
      );
    }
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function reparentCustomSubsOntoMappedParents(env: CategoryMigrationEnv, uid: string, written: Set<string>) {
  const db = env.db;
  const { doc, collection } = env;
  const snap = await env.getDocs(collection(db, "users", uid, "categories"));
  env.logDirectRead?.(
    `users/${uid}/categories`,
    snap.docs.length,
    snap.metadata.fromCache ? "cache" : "server",
    { feature: "categoryHierarchy", queryShape: "categories" }
  );
  const docs: CategoryDoc[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CategoryDoc, "id">),
  }));
  const byId = new Map(docs.map((d) => [d.id, d]));
  const defaultParentsByName = new Map<string, string>();
  for (const item of docs) {
    if (item.isDefault === false) continue;
    if (item.kind === "subcategory") continue;
    if (item.parentId) continue;
    if (item.isArchived) continue;
    if (item.name) defaultParentsByName.set(item.name, item.id);
  }

  const writer = createBatchWriter(env, written);
  for (const item of docs) {
    if (item.isDefault !== false || item.kind !== "subcategory" || !item.parentId) continue;
    const parent = byId.get(item.parentId);
    if (parent && !parent.isArchived) continue;
    const oldName = parent?.name ?? "";
    const mappedParent =
      mapToV4Category(oldName, undefined)?.category ??
      V1_PARENT_MAP[oldName]?.category ??
      oldName;
    const newParentId = defaultParentsByName.get(mappedParent);
    if (!newParentId || newParentId === item.parentId) continue;
    writer.set(
      doc(db, "users", uid, "categories", item.id),
      { parentId: newParentId, updatedAt: env.serverTimestamp() },
      true
    );
    await writer.maybeFlush();
  }
  await writer.flush();
}

async function remapAllNamedPairsToV4(env: CategoryMigrationEnv, uid: string, written: Set<string>) {
  await remapExpenses(env, uid, written);
  await remapNamedPairs(env, uid, "categoryBudgets", written);
  await remapNamedPairs(env, uid, "categorizationRules", written);
  await remapSubscriptions(env, uid, written);
  await remapTripCategoryBudgets(env, uid, written);
  await remapDefaultCategorySetting(env, uid, written);
}

async function remapExpenses(env: CategoryMigrationEnv, uid: string, written: Set<string>) {
  const db = env.db;
  const { collection } = env;
  const expensesSnap = await env.getDocs(collection(db, "users", uid, "expenses"));
  const writer = createBatchWriter(env, written);

  for (const expenseDoc of expensesSnap.docs) {
    const data = expenseDoc.data();
    const mapped = mapToV4Category(
      (data.category as string) || "Miscellaneous",
      typeof data.subcategory === "string" ? data.subcategory : "",
      (data.note as string) || ""
    );
    if (!mapped) continue;
    if (mappedEquals(data.category, data.subcategory, mapped)) continue;

    writer.update(expenseDoc.ref, {
      category: mapped.category,
      subcategory: mapped.subcategory,
      tags: Array.isArray(data.tags) ? data.tags : [],
      updatedAt: env.serverTimestamp(),
    });
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function remapNamedPairs(
  env: CategoryMigrationEnv,
  uid: string,
  subcollection: "categoryBudgets" | "categorizationRules",
  written: Set<string>
) {
  const db = env.db;
  const { collection } = env;
  const snap = await env.getDocs(collection(db, "users", uid, subcollection));
  env.logDirectRead?.(
    `users/${uid}/${subcollection}`,
    snap.docs.length,
    snap.metadata.fromCache ? "cache" : "server",
    { feature: "categoryHierarchy", queryShape: subcollection }
  );
  const writer = createBatchWriter(env, written);

  for (const row of snap.docs) {
    const data = row.data();
    const category = typeof data.category === "string" ? data.category : "";
    if (!category) continue;
    const subcategory =
      typeof data.subcategory === "string" ? data.subcategory : undefined;
    const mapped = mapToV4Category(category, subcategory);
    if (!mapped) continue;
    if (mappedEquals(data.category, data.subcategory ?? "", mapped)) continue;

    writer.update(row.ref, {
      category: mapped.category,
      subcategory: mapped.subcategory,
    });
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function remapSubscriptions(env: CategoryMigrationEnv, uid: string, written: Set<string>) {
  const db = env.db;
  const { collection } = env;
  const snap = await env.getDocs(collection(db, "users", uid, "subscriptions"));
  env.logDirectRead?.(
    `users/${uid}/subscriptions`,
    snap.docs.length,
    snap.metadata.fromCache ? "cache" : "server",
    { feature: "categoryHierarchy", queryShape: "subscriptions" }
  );
  const writer = createBatchWriter(env, written);

  for (const row of snap.docs) {
    const data = row.data();
    const category = typeof data.category === "string" ? data.category : "";
    if (!category) continue;
    const mapped = mapToV4Category(category, undefined);
    if (!mapped) continue;
    if (mapped.category === category) continue;
    writer.update(row.ref, { category: mapped.category });
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function remapTripCategoryBudgets(env: CategoryMigrationEnv, uid: string, written: Set<string>) {
  const db = env.db;
  const { collection } = env;
  const snap = await env.getDocs(collection(db, "users", uid, "trips"));
  const writer = createBatchWriter(env, written);

  for (const row of snap.docs) {
    const data = row.data();
    const budgets = data.categoryBudgets;
    if (!Array.isArray(budgets) || budgets.length === 0) continue;

    let changed = false;
    const next = budgets.map((item: { category?: string; limit?: number }) => {
      if (typeof item?.category !== "string") return item;
      const mapped = mapToV4Category(item.category, undefined);
      if (!mapped || mapped.category === item.category) return item;
      changed = true;
      return { ...item, category: mapped.category };
    });

    if (!changed) continue;
    writer.update(row.ref, { categoryBudgets: next });
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function remapDefaultCategorySetting(env: CategoryMigrationEnv, uid: string, written: Set<string>) {
  const db = env.db;
  const { doc } = env;
  const userRef = doc(db, "users", uid);
  const userSnap = await env.getDoc(userRef);
  if (!userSnap.exists()) return;

  const current = userSnap.data()?.defaultCategory;
  if (typeof current !== "string" || !current.trim()) return;

  const mapped = mapToV4Category(current, undefined);
  if (!mapped || mapped.category === current) return;

  await env.setDoc(userRef, { defaultCategory: mapped.category }, { merge: true });
  written.add(userRef.path);
}
