import {
  doc,
  getDoc,
  getDocFromCache,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "@/lib/firestore";
import { isCreditCardAccount } from "@/shared/utils/accountKind";

export type AccountInfo = {
  isCreditCard: boolean;
  oldBalance: number;
  oldOutstanding: number;
  /** SPENDLY-436: true when `balanceInitialized` was missing on the account. */
  needsInitialization: boolean;
  /** SPENDLY-496: false when no account doc was found (e.g. it was deleted). */
  exists: boolean;
  /** SPENDLY-496: the account's baseline; earlier rows sit inside the opening balance. */
  balanceAsOfDate: string | null;
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

/** Cache first, then server; null when neither can answer. */
async function readDocCacheFirst(ref: DocumentReference): Promise<DocumentSnapshot | null> {
  try {
    return await getDocFromCache(ref);
  } catch {
    try {
      return await getDoc(ref);
    } catch {
      return null;
    }
  }
}

/**
 * SPENDLY-523: has a deterministic-id ledger doc already been written?
 *
 * Guards a non-idempotent `increment()` behind "first write only". Cache
 * first, so this device's own pending write counts and the save never waits
 * on the network. When neither the cache nor the server can answer (offline,
 * never cached), the doc is treated as new: refusing would block offline
 * saves, and a doc this device never wrote or read is new in the common case.
 */
export async function docAlreadyWritten(ref: DocumentReference): Promise<boolean> {
  try {
    return (await getDocFromCache(ref)).exists();
  } catch {
    try {
      return (await getDoc(ref)).exists();
    } catch {
      return false;
    }
  }
}

export function accountInfoFromSnap(snap: DocumentSnapshot, typeName?: string | null): AccountInfo {
  if (!snap.exists()) {
    return {
      isCreditCard: false,
      oldBalance: 0,
      oldOutstanding: 0,
      needsInitialization: false,
      exists: false,
      balanceAsOfDate: null,
    };
  }
  const data = snap.data();
  // SPENDLY-497: the same rule the screens use (the account type's name).
  const isCreditCard = isCreditCardAccount({ typeName, accountTypeId: data.accountTypeId });
  // SPENDLY-436: a missing `balanceInitialized` means currentBalance was
  // never seeded — reading it as `?? 0` here would silently drop
  // openingBalance the moment this edit/delete/restore applies.
  const needsInitialization = data.balanceInitialized !== true;
  return {
    isCreditCard,
    oldBalance: needsInitialization ? (data.openingBalance ?? 0) : (data.currentBalance ?? 0),
    oldOutstanding: data.currentOutstanding ?? 0,
    needsInitialization,
    exists: true,
    balanceAsOfDate: typeof data.balanceAsOfDate === "string" ? data.balanceAsOfDate : null,
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
  // SPENDLY-497: the account type's name decides card vs bank, as on read.
  // accountTypes has a session-long listener too, so this is a cache read.
  const typeIds = Array.from(
    new Set(
      snaps
        .map((snap) => (snap.exists() ? (snap.data().typeId as string | undefined) : undefined))
        .filter((typeId): typeId is string => Boolean(typeId))
    )
  );
  const typeNames = new Map<string, string>();
  await Promise.all(
    typeIds.map(async (typeId) => {
      const typeSnap = await readDocCacheFirst(doc(db, "users", uid, "accountTypes", typeId));
      if (typeSnap?.exists()) typeNames.set(typeId, String(typeSnap.data().name ?? ""));
    })
  );
  const result = new Map<string, AccountInfo>();
  uniqueIds.forEach((id, index) => {
    const snap = snaps[index];
    const typeId = snap.exists() ? (snap.data().typeId as string | undefined) : undefined;
    result.set(id, accountInfoFromSnap(snap, typeId ? typeNames.get(typeId) : undefined));
  });
  return result;
}
