/**
 * SPENDLY-753 — read-only Firestore ↔ Supabase category audit. Rules:
 * scripts/lib/categoryDuplicateAuditCore.ts. Writes nothing, ever: this is
 * the ticket's mandatory investigation gate, not a repair tool.
 *
 *   npx tsx scripts/categoryDuplicateAudit.ts --uid=<uid>
 *   npx tsx scripts/categoryDuplicateAudit.ts --uid=<uid> --plan   # also print
 *                                                                  # a dry-run
 *                                                                  # repair mapping
 *
 * Credentials: CATEGORY_AUDIT_FIREBASE_SERVICE_ACCOUNT or
 * FIREBASE_SERVICE_ACCOUNT (JSON). FIRESTORE_EMULATOR_HOST reads the emulator
 * instead. Supabase comparison needs READMODEL_SUPABASE_URL +
 * READMODEL_SUPABASE_SERVICE_ROLE_KEY (service-role key, server-side only);
 * without them this still reports the Firestore-only half and says so.
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

import { auditCategories, planDuplicateRepair, type CategoryAuditDoc } from "./lib/categoryDuplicateAuditCore";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function readFirestoreCategories(uid: string): Promise<CategoryAuditDoc[]> {
  const raw = process.env.CATEGORY_AUDIT_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  // No `limit` — exactly the fix in providers/ExpenseReferenceDataProvider.tsx;
  // the whole point of this audit is to never repeat the truncation bug.
  const snap = await db.collection("users").doc(uid).collection("categories").get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? ""),
      kind: data.kind,
      parentId: data.parentId ?? undefined,
      semanticKey: data.semanticKey,
      isDefault: !!data.isDefault,
      isArchived: !!data.isArchived,
      isHidden: !!data.isHidden,
      createdAt: data.createdAt,
    };
  });
}

async function readSupabaseCategories(uid: string): Promise<{ docs: CategoryAuditDoc[]; skipped: boolean }> {
  const url = process.env.READMODEL_SUPABASE_URL;
  const key = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { docs: [], skipped: true };
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const docs: CategoryAuditDoc[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("categories")
      .select("doc_id, name, kind, parent_id, semantic_key, is_default, is_archived, is_hidden")
      .eq("uid", uid)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    for (const row of data ?? []) {
      docs.push({
        id: String(row.doc_id),
        name: String(row.name ?? ""),
        kind: row.kind ?? undefined,
        parentId: row.parent_id ?? undefined,
        semanticKey: row.semantic_key ?? undefined,
        isDefault: !!row.is_default,
        isArchived: !!row.is_archived,
        isHidden: !!row.is_hidden,
      });
    }
    if (!data || data.length < pageSize) break;
  }
  return { docs, skipped: false };
}

async function main() {
  const uid = arg("uid");
  if (!uid) {
    console.error("Usage: npx tsx scripts/categoryDuplicateAudit.ts --uid=<uid> [--plan]");
    process.exitCode = 1;
    return;
  }
  const plan = process.argv.includes("--plan");

  const firestoreDocs = await readFirestoreCategories(uid);
  const { docs: supabaseDocs, skipped } = await readSupabaseCategories(uid);
  const report = auditCategories(uid, firestoreDocs, skipped ? firestoreDocs : supabaseDocs);

  const output: Record<string, unknown> = { ...report };
  if (skipped) output.supabaseComparisonSkipped = "READMODEL_SUPABASE_URL/READMODEL_SUPABASE_SERVICE_ROLE_KEY not set — Firestore-only counts shown for both sides";

  if (plan) {
    const docsById = new Map(firestoreDocs.map((d) => [d.id, d]));
    output.repairPlan = {
      note: "Read-only proposal. Nothing here is applied. A merge/archive of any duplicateIds needs its own ticket and explicit approval.",
      parents: planDuplicateRepair(report.duplicateParents, docsById),
      subcategories: planDuplicateRepair(report.duplicateSubcategories, docsById),
    };
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
