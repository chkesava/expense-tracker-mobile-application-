import { doc, getDoc, type Firestore } from "firebase/firestore";

export type AccountInfo = {
  isCreditCard: boolean;
  oldBalance: number;
  oldOutstanding: number;
  /** SPENDLY-436: true when `balanceInitialized` was missing on the account. */
  needsInitialization: boolean;
};

export async function fetchAccountTypes(
  db: Firestore,
  uid: string,
  accountIds: (string | null | undefined)[]
): Promise<Map<string, AccountInfo>> {
  const uniqueIds = Array.from(new Set(accountIds.filter(Boolean))) as string[];
  const result = new Map<string, AccountInfo>();

  for (const id of uniqueIds) {
    const snap = await getDoc(doc(db, "users", uid, "accounts", id));
    if (snap.exists()) {
      const data = snap.data();
      const isCredit = data.accountTypeId === "credit_card" ||
        (data.name || "").toLowerCase().includes("credit");
      // SPENDLY-436: a missing `balanceInitialized` means currentBalance was
      // never seeded — reading it as `?? 0` here would silently drop
      // openingBalance the moment this edit/delete/restore applies.
      const needsInitialization = data.balanceInitialized !== true;
      result.set(id, {
        isCreditCard: isCredit,
        oldBalance: needsInitialization ? (data.openingBalance ?? 0) : (data.currentBalance ?? 0),
        oldOutstanding: data.currentOutstanding ?? 0,
        needsInitialization,
      });
    } else {
      result.set(id, { isCreditCard: false, oldBalance: 0, oldOutstanding: 0, needsInitialization: false });
    }
  }

  return result;
}
