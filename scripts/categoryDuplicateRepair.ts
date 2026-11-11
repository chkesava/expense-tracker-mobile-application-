/**
 * SPENDLY-753 — repairs the duplicate category/subcategory groups
 * scripts/categoryDuplicateAudit.ts finds. Rules:
 * scripts/lib/categoryDuplicateRepairCore.ts. Dry run by default — nothing
 * is written unless `--apply` is passed. Writes go through
 * scripts/lib/dailyJobCore.ts's `applyJobWrites`, the same server-writer
 * contract every other daily job uses.
 *
 *   npx tsx scripts/categoryDuplicateRepair.ts --uid=<uid>              # dry run
 *   npx tsx scripts/categoryDuplicateRepair.ts --uid=<uid> --apply      # writes
 *
 * A duplicate is archived (isArchived: true, lock cleared), never deleted —
 * reversible. Every expense/budget that pointed at a duplicate's name is
 * relabeled to the surviving doc's name; a reparented subcategory that
 * collides with a sibling is renamed "<name> (from <parent>)", the same
 * disambiguation hooks/useCategories.ts's mergeCategories uses.
 *
 * Credentials: CATEGORY_AUDIT_FIREBASE_SERVICE_ACCOUNT or
 * FIREBASE_SERVICE_ACCOUNT (JSON). FIRESTORE_EMULATOR_HOST reads the emulator
 * instead. READMODEL_SUPABASE_SERVICE_ROLE_KEY + READMODEL_SUPABASE_URL push
 * the changes to the read model after a real apply (optional; without them
 * the next nightly sync catches up instead).
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { applyJobWrites, JOB_BATCH_LIMIT, type JobBatch, type JobWrite } from "./lib/dailyJobCore";
import {
  DELETE_FIELD,
  isNoop,
  planCategoryDuplicateRepair,
  type RepairBudgetDoc,
  type RepairCategoryDoc,
  type RepairExpenseDoc,
} from "./lib/categoryDuplicateRepairCore";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

function translateDeleteField(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = v === DELETE_FIELD ? FieldValue.delete() : v;
  return out;
}

function initFirestore(): Firestore {
  const raw = process.env.CATEGORY_AUDIT_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  return getFirestore(app);
}

async function readCategories(db: Firestore, uid: string): Promise<RepairCategoryDoc[]> {
  const snap = await db.collection("users").doc(uid).collection("categories").get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? ""),
      kind: data.kind,
      parentId: data.parentId ?? undefined,
      isDefault: !!data.isDefault,
      isArchived: !!data.isArchived,
      nameKey: data.nameKey,
      subNameKey: data.subNameKey,
      createdAt: data.createdAt,
    };
  });
}

async function readExpenses(db: Firestore, uid: string): Promise<RepairExpenseDoc[]> {
  const snap = await db.collection("users").doc(uid).collection("expenses").get();
  return snap.docs.map((d) => ({ id: d.id, category: d.data().category, subcategory: d.data().subcategory }));
}

async function readBudgets(db: Firestore, uid: string): Promise<RepairBudgetDoc[]> {
  const snap = await db.collection("users").doc(uid).collection("categoryBudgets").get();
  return snap.docs.map((d) => ({ id: d.id, category: d.data().category, subcategory: d.data().subcategory }));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const uid = arg("uid");
  if (!uid) {
    console.error("Usage: npx tsx scripts/categoryDuplicateRepair.ts --uid=<uid> [--apply]");
    process.exitCode = 1;
    return;
  }
  const apply = process.argv.includes("--apply");
  const db = initFirestore();

  const [categories, expenses, budgets] = await Promise.all([readCategories(db, uid), readExpenses(db, uid), readBudgets(db, uid)]);
  const plan = planCategoryDuplicateRepair(uid, categories, expenses, budgets);

  console.log(JSON.stringify({ uid, dryRun: !apply, groups: plan.groups, noop: isNoop(plan) }, null, 2));
  if (isNoop(plan)) {
    console.log("Nothing to repair — no active duplicate groups found.");
    return;
  }

  // A matched expense/budget isn't always a real change: a duplicate and its
  // canonical can share the exact same name string already (only an id
  // differs), so only emit a write when a field's value actually changes —
  // otherwise this would touch updatedAt on documents nothing changed about.
  const changedFields = (before: { category?: string; subcategory?: string }, after: { category?: string; subcategory?: string }) => {
    const data: Record<string, unknown> = {};
    if (after.category !== before.category) data.category = after.category;
    if (after.subcategory !== before.subcategory) data.subcategory = after.subcategory;
    return data;
  };

  const writes: JobWrite[] = [
    ...plan.categoryWrites.map((w): JobWrite => ({ kind: "update", path: `users/${uid}/categories/${w.id}`, data: translateDeleteField(w.data) })),
    ...plan.expenseWrites
      .map((w): JobWrite => ({ kind: "update", path: `users/${uid}/expenses/${w.id}`, data: changedFields(w.before, w.after) }))
      .filter((w) => Object.keys(w.data).length > 0),
    ...plan.budgetWrites
      .map((w): JobWrite => ({ kind: "update", path: `users/${uid}/categoryBudgets/${w.id}`, data: changedFields(w.before, w.after) }))
      .filter((w) => Object.keys(w.data).length > 0),
    ...plan.lockDeletes.map((d): JobWrite => ({ kind: "delete", path: `users/${uid}/${d.collection}/${d.key}` })),
  ];

  const log = (line: string) => console.log(line);
  const push = apply ? createServerPush(serverPushPorts(db, log)) : null;
  const jobDb = {
    doc: (path: string) => db.doc(path),
    batch: (): JobBatch => db.batch() as unknown as JobBatch,
  };

  let written = 0;
  let conflicts = 0;
  let failed = 0;
  for (const part of chunk(writes, JOB_BATCH_LIMIT)) {
    const result = await applyJobWrites({ db: jobDb, uid, writes: part, dryRun: !apply, stamp: () => FieldValue.serverTimestamp(), push, log });
    if (result.status === "written") written += result.paths.length;
    else if (result.status === "conflict") {
      conflicts++;
      log(`[CONFLICT] ${result.reason}`);
    } else if (result.status === "failed") {
      failed++;
      log(`[FAILED] ${result.reason}`);
    }
  }

  if (apply) await push?.flush();
  console.log(JSON.stringify({ totalWrites: writes.length, written, conflicts, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
