/**
 * SPENDLY-660 — the device side of loading categories by revision
 * (`shared/utils/categoryRevision.ts`).
 *
 * - `noteCategoriesWritten`: every category writer calls it, so other devices
 *   (through the `meta/categories` listener) and the read model (SPENDLY-583
 *   push) see the change. The categories listener used to do both.
 * - `readCategoriesLoadRecord` / `writeCategoriesLoadRecord`: what this
 *   device last loaded from the server, per user, in AsyncStorage. Storage
 *   failures are swallowed: the cost is one server load.
 */
import { doc, increment, serverTimestamp, setDoc, type Firestore } from "@/lib/firestore";
import { logWarning } from "@/lib/errors";
import { notifyReadModelChanged, notifyReadModelWrites } from "@/lib/readModelPush";
import {
  CATEGORIES_REVISION_FIELD,
  parseCategoriesLoadRecord,
  type CategoriesLoadRecord,
} from "@/shared/utils/categoryRevision";

/**
 * Bumps the categories revision and tells the read-model push.
 *
 * Call it right after **starting** the category write and before awaiting it.
 * Firestore applies one client's writes in call order, so the bump never lands
 * before the change it announces, and this device's own `meta` listener sees
 * the pending bump at once (offline too).
 *
 * `ids` are the written category documents. Leave it out when they aren't
 * known, and the push syncs the user's changed documents instead.
 */
export function noteCategoriesWritten(db: Firestore, uid: string, ids?: string[]): void {
  setDoc(
    doc(db, "users", uid, "meta", "categories"),
    { [CATEGORIES_REVISION_FIELD]: increment(1), categoriesRevisedAt: serverTimestamp() },
    { merge: true }
  ).catch((error) => logWarning("categories.revision", error));
  if (ids && ids.length > 0) {
    notifyReadModelWrites(
      uid,
      ids.map((id) => `users/${uid}/categories/${id}`)
    );
  } else {
    notifyReadModelChanged(uid);
  }
}

export function categoriesLoadRecordKey(uid: string): string {
  return `spendly.categoriesLoad.v1.${uid}`;
}

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

export async function readCategoriesLoadRecord(uid: string): Promise<CategoriesLoadRecord | null> {
  try {
    const raw = await (await getStorage()).getItem(categoriesLoadRecordKey(uid));
    return raw ? parseCategoriesLoadRecord(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function writeCategoriesLoadRecord(uid: string, record: CategoriesLoadRecord): Promise<void> {
  try {
    await (await getStorage()).setItem(categoriesLoadRecordKey(uid), JSON.stringify(record));
  } catch {
    // Memory only: the next launch loads from the server once.
  }
}
