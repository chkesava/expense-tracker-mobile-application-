/** User-scoped merchant corrections (SPENDLY-191). */

import { collection, doc, getDocs } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { MerchantOverride } from "@/shared/types/merchant";
import { merchantOverrideId, validateMerchantOverride } from "@/shared/utils/merchantModel";

const COLLECTION = "merchantOverrides";

function overridesCollection(uid: string) {
  const db = getFirestoreDb();
  return db ? collection(db, "users", uid, COLLECTION) : null;
}

export async function listMerchantOverrides(uid: string): Promise<MerchantOverride[]> {
  if (!uid.trim()) return [];
  const ref = overridesCollection(uid);
  if (!ref) return [];
  const snapshot = await getDocs(ref);
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as MerchantOverride);
}

export async function saveMerchantOverride(
  uid: string,
  draft: Omit<MerchantOverride, "id" | "createdAtMs" | "updatedAtMs">,
): Promise<"acked" | "queued" | "unsafe"> {
  const issues = validateMerchantOverride(draft);
  if (issues.length > 0) throw new Error(issues[0]);
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available");

  const now = Date.now();
  const id = merchantOverrideId(draft.kind, draft.refKey);
  const data = {
    kind: draft.kind,
    refKey: draft.refKey,
    ...(draft.merchantId ? { merchantId: draft.merchantId } : {}),
    ...(draft.customName ? { customName: draft.customName.trim() } : {}),
    ...(draft.rejected ? { rejected: true } : {}),
    ...(draft.category ? { category: draft.category.trim() } : {}),
    ...(draft.subcategory ? { subcategory: draft.subcategory.trim() } : {}),
    createdAtMs: now,
    updatedAtMs: now,
  };
  return commitMutations(
    uid,
    [{ op: "set", ref: doc(db, "users", uid, COLLECTION, id), data }],
    { label: "merchant correction" },
  );
}

export async function deleteMerchantOverride(uid: string, kind: MerchantOverride["kind"], refKey: string) {
  const db = getFirestoreDb();
  if (!db || !uid.trim() || !refKey.trim()) return "acked" as const;
  return commitMutations(
    uid,
    [{ op: "delete", ref: doc(db, "users", uid, COLLECTION, merchantOverrideId(kind, refKey)) }],
    { label: "merchant correction reset" },
  );
}

