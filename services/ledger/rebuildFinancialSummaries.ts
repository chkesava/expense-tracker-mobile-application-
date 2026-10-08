import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { computeBankBalance, computeOutstandingCredit } from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import type { Account, Expense, Income, AccountPayment, AccountEntry, AccountTransfer } from "@/shared/types/expense";
import type { Borrowing, BorrowingRepayment } from "@/shared/types/borrowing";
import type { Receivable, ReceivableRepayment } from "@/shared/types/receivable";
import { todayDateKey } from "@/shared/utils/dates";
import type { OpenCreditBillSlice } from "@/shared/utils/accountBalance";

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
  typesSnap.forEach(d => typeMap.set(d.id, d.data().name));
  
  const typeName = typeMap.get(account.typeId) || "";
  const kind = getAccountKind(typeName);

  async function fetchCollection<T>(colName: string, idField?: string): Promise<T[]> {
    let q = query(collection(db!, "users", uid, colName));
    if (idField) {
      q = query(q, where(idField, "==", accountId));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as unknown as T);
  }

  const expenses = await fetchCollection<Expense>("expenses", "accountId");
  // Payments are linked by fromAccountId or toAccountId, requiring 2 queries or a full fetch.
  // For client reliability, just fetch all and filter in memory since payments volume is manageable.
  const allPayments = await fetchCollection<AccountPayment>("accountPayments");
  const filteredPayments = allPayments.filter(p => p.fromAccountId === account.id || p.toAccountId === account.id);

  let expectedUpdates: Partial<Account> = {};
  const variances: RebuildVariance[] = [];
  
  if (kind === "credit") {
    const bills = await fetchCollection<OpenCreditBillSlice>("creditCardBills", "accountId");
    const usage = computeOutstandingCredit(account, expenses, filteredPayments, bills, todayDateKey());
    
    expectedUpdates = {
      currentOutstanding: usage.totalOutstanding,
      unbilledSpend: usage.unbilledSpend,
      statementDue: usage.statementDue,
      availableCredit: usage.availableCredit,
      paidThisCycle: usage.paidThisCycle,
      cashbackThisCycle: usage.cashbackThisCycle,
      oldestOpenRemaining: usage.oldestOpenRemaining,
      oldestOpenBillId: usage.oldestOpenBillId || undefined,
      openCycleStart: usage.openCycleStart,
    };
  } else {
    const incomes = await fetchCollection<Income>("incomes", "accountId");
    const entries = await fetchCollection<AccountEntry>("accountEntries", "accountId");
    
    const allTransfers = await fetchCollection<AccountTransfer>("transfers");
    const filteredTransfers = allTransfers.filter(t => t.fromAccountId === account.id || t.toAccountId === account.id);
    
    const borrowings = await fetchCollection<Borrowing>("borrowings", "accountId");
    const borrowingRepayments = await fetchCollection<BorrowingRepayment>("borrowingRepayments", "accountId");
    const receivables = await fetchCollection<Receivable>("receivables", "accountId");
    const receivableRepayments = await fetchCollection<ReceivableRepayment>("receivableRepayments", "accountId");

    const bal = computeBankBalance(
      account,
      expenses,
      incomes,
      filteredPayments,
      entries,
      filteredTransfers,
      borrowings,
      borrowingRepayments,
      receivables,
      receivableRepayments,
      todayDateKey()
    );

    expectedUpdates = {
      currentBalance: bal,
    };
  }

  for (const [key, expected] of Object.entries(expectedUpdates)) {
    const actual = (account as any)[key];
    if (actual !== expected && !(actual === undefined && expected === null)) {
      variances.push({ field: key, expected, actual });
    }
  }

  const hasVariance = variances.length > 0;

  if (hasVariance && mode === "apply") {
    const batch = writeBatch(db);
    batch.update(accountRef, {
      ...expectedUpdates,
      balanceReconciliationStatus: "healthy",
      balanceLastRebuiltAt: serverTimestamp(),
    });
    await batch.commit();
  }

  return {
    accountId,
    hasVariance,
    variances,
    applied: hasVariance && mode === "apply",
  };
}
