import { collection, deleteField, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from "@/lib/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { Account, Expense, Income, AccountPayment, AccountEntry, AccountTransfer } from "@/shared/types/expense";
import type { Borrowing, BorrowingRepayment } from "@/shared/types/borrowing";
import type { Receivable, ReceivableRepayment } from "@/shared/types/receivable";
import { todayDateKey } from "@/shared/utils/dates";
import type { OpenCreditBillSlice } from "@/shared/utils/accountBalance";
import {
  accountRebuildWrite,
  accountSourcesFor,
  planAccountRebuild,
} from "@/shared/utils/reconciliation";

export type RebuildVariance = {
  field: string;
  expected: any;
  actual: any;
};

export type RebuildResult = {
  accountId: string;
  hasVariance: boolean;
  variances: RebuildVariance[];
  applied: boolean;
};

/**
 * In-app rebuild of one account (EditAccountModal → "Rebuild").
 *
 * SPENDLY-499: computes through `planAccountRebuild` and writes
 * `accountRebuildWrite`, the same single reference both scripts use, so the
 * three rebuilds can no longer disagree. A source query that fails throws, so
 * nothing is ever marked healthy on partial data.
 */
export async function rebuildFinancialSummaries(
  uid: string,
  accountId: string,
  mode: "dryRun" | "apply"
): Promise<RebuildResult> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore not initialized");
  const accountRef = doc(db, "users", uid, "accounts", accountId);
  const accountSnap = await getDoc(accountRef);

  if (!accountSnap.exists()) {
    throw new Error(`Account ${accountId} not found.`);
  }

  const account = { id: accountSnap.id, ...accountSnap.data() } as unknown as Account;
  const typesSnap = await getDocs(collection(db, "users", uid, "accountTypes"));
  const typeMap = new Map<string, string>();
  typesSnap.forEach((d) => typeMap.set(d.id, d.data().name));
  const typeName = typeMap.get(account.typeId) || "";

  async function fetchCollection<T>(colName: string, idField?: string): Promise<T[]> {
    let q = query(collection(db!, "users", uid, colName));
    if (idField) {
      q = query(q, where(idField, "==", accountId));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T);
  }

  // Rows with an `accountId` are queried by it; the rest relate through other
  // fields (fromAccountId/toAccountId, creditedAccountId, …) and are scoped in
  // memory by `accountSourcesFor`, the same helper the scripts use.
  const sources = accountSourcesFor(account.id, {
    expenses: await fetchCollection<Expense>("expenses", "accountId"),
    incomes: await fetchCollection<Income>("incomes", "accountId"),
    entries: await fetchCollection<AccountEntry>("accountEntries", "accountId"),
    payments: await fetchCollection<AccountPayment>("accountPayments"),
    transfers: await fetchCollection<AccountTransfer>("accountTransfers"),
    borrowings: await fetchCollection<Borrowing>("borrowings"),
    borrowingRepayments: await fetchCollection<BorrowingRepayment>("borrowingRepayments"),
    receivables: await fetchCollection<Receivable>("receivables"),
    receivableRepayments: await fetchCollection<ReceivableRepayment>("receivableRepayments"),
    bills: await fetchCollection<OpenCreditBillSlice>("creditCardBills", "accountId"),
  });

  const plan = planAccountRebuild(account, typeName, sources, todayDateKey());
  const balanceField = plan.kind === "credit" ? "currentOutstanding" : "currentBalance";
  const variances: RebuildVariance[] =
    plan.variances.some((line) => line.startsWith(`${balanceField}:`))
      ? [{ field: balanceField, expected: plan.set[balanceField], actual: (account as any)[balanceField] }]
      : [];

  if (plan.needsWrite && mode === "apply") {
    const batch = writeBatch(db);
    batch.update(accountRef, accountRebuildWrite(plan, { remove: deleteField, now: serverTimestamp }));
    await batch.commit();
  }

  return {
    accountId,
    hasVariance: variances.length > 0,
    variances,
    applied: plan.needsWrite && mode === "apply",
  };
}
