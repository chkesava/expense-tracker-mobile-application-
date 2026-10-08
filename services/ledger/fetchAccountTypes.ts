import { doc, getDoc, type Firestore } from "firebase/firestore";

export async function fetchAccountTypes(
  db: Firestore,
  uid: string,
  accountIds: (string | null | undefined)[]
): Promise<Map<string, boolean>> {
  const uniqueIds = Array.from(new Set(accountIds.filter(Boolean))) as string[];
  const result = new Map<string, boolean>();
  
  for (const id of uniqueIds) {
    const snap = await getDoc(doc(db, "users", uid, "accounts", id));
    if (snap.exists()) {
      const data = snap.data();
      const isCredit = data.accountTypeId === "credit_card" || 
        (data.name || "").toLowerCase().includes("credit");
      result.set(id, isCredit);
    } else {
      result.set(id, false);
    }
  }
  
  return result;
}
