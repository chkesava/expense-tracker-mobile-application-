import {
  doc,
  getDoc,
  getDocFromCache,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";

export type AccountInfo = {
  isCreditCard: boolean;
  oldBalance: number;
  oldOutstanding: number;
  /** SPENDLY-436: true when `balanceInitialized` was missing on the account. */
  needsInitialization: boolean;
};

/**
 * One account doc, cache first (SPENDLY-491). The accounts collection has a
 * live listener for the whole session, so the local cache holds every account
 * at its latest known state, including this device's pending writes. Waiting
 * on a server round trip here held every save open on a slow network, or
 * until Firestore gave up and went offline. Only a doc the cache has never
 * seen falls back to the server.
 */
export async function readAccountSnap(
  db: Firestore,
  uid: string,
  accountId: string
): Promise<DocumentSnapshot> {
  const ref = doc(db, "users", uid, "accounts", accountId);
  try {
    return await getDocFromCache(ref);
  } catch {
    return getDoc(ref);
  }
}

export function accountInfoFromSnap(snap: DocumentSnapshot): AccountInfo {
  if (!snap.exists()) {
    return { isCreditCard: false, oldBalance: 0, oldOutstanding: 0, needsInitialization: false };
  }
  const data = snap.data();
  const isCreditCard = data.accountTypeId === "credit_card" ||
    (data.name || "").toLowerCase().includes("credit");
  // SPENDLY-436: a missing `balanceInitialized` means currentBalance was
  // never seeded — reading it as `?? 0` here would silently drop
  // openingBalance the moment this edit/delete/restore applies.
  const needsInitialization = data.balanceInitialized !== true;
  return {
    isCreditCard,
    oldBalance: needsInitialization ? (data.openingBalance ?? 0) : (data.currentBalance ?? 0),
    oldOutstanding: data.currentOutstanding ?? 0,
    needsInitialization,
  };
}

export async function fetchAccountTypes(
  db: Firestore,
  uid: string,
  accountIds: (string | null | undefined)[]
): Promise<Map<string, AccountInfo>> {
  const uniqueIds = Array.from(new Set(accountIds.filter(Boolean))) as string[];
  const snaps = await Promise.all(
    uniqueIds.map((id) => readAccountSnap(db, uid, id))
  );
  const result = new Map<string, AccountInfo>();
  uniqueIds.forEach((id, index) => {
    result.set(id, accountInfoFromSnap(snaps[index]));
  });
  return result;
}
