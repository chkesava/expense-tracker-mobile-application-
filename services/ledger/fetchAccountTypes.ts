import { doc, getDoc, type Firestore } from "firebase/firestore";

export type AccountInfo = {
  isCreditCard: boolean;
  oldBalance: number;
  oldOutstanding: number;
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
      result.set(id, {
        isCreditCard: isCredit,
        oldBalance: data.currentBalance ?? 0,
        oldOutstanding: data.currentOutstanding ?? 0,
      });
    } else {
      result.set(id, { isCreditCard: false, oldBalance: 0, oldOutstanding: 0 });
    }
  }
  
  return result;
}
