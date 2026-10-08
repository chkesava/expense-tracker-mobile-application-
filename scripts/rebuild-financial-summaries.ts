import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { computeBankBalance, computeOutstandingCredit } from "../shared/utils/accountBalance";
import { getAccountKind } from "../shared/utils/accountKind";
import type { Account } from "../shared/types/expense";

// Minimal shim for `todayDateKey` if needed, or import it.
import { todayDateKey } from "../shared/utils/dates";

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return cert(JSON.parse(raw));
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault();
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents."
  );
}

const app = initializeApp({ credential: loadCredential() });
const db = getFirestore(app);

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dryRun";
const uidArg = args.find((a) => a.startsWith("--uid="));
const accountIdArg = args.find((a) => a.startsWith("--accountId="));

const TARGET_UID = uidArg ? uidArg.split("=")[1] : null;
const TARGET_ACCOUNT_ID = accountIdArg ? accountIdArg.split("=")[1] : null;

async function fetchCollection(uid: string, colName: string, accountIdFilterField?: string, accountId?: string) {
  let q = db.collection("users").doc(uid).collection(colName) as any;
  if (accountIdFilterField && accountId) {
    q = q.where(accountIdFilterField, "==", accountId);
  }
  const snap = await q.get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}

async function rebuildForUser(uid: string) {
  console.log(`\nRebuilding summaries for user: ${uid} (Mode: ${mode})`);
  
  // 1. Fetch account types
  const typesSnap = await db.collection("users").doc(uid).collection("accountTypes").get();
  const typeMap = new Map<string, string>();
  typesSnap.forEach(d => typeMap.set(d.id, d.data().name));

  // 2. Fetch accounts
  let accountsQuery = db.collection("users").doc(uid).collection("accounts") as any;
  if (TARGET_ACCOUNT_ID) {
    accountsQuery = accountsQuery.where("__name__", "==", TARGET_ACCOUNT_ID);
  }
  const accountsSnap = await accountsQuery.get();
  
  if (accountsSnap.empty) {
    console.log("  No accounts found.");
    return;
  }

  // 3. For each account
  for (const doc of accountsSnap.docs) {
    const account = { id: doc.id, ...doc.data() } as unknown as Account;
    const typeName = typeMap.get(account.typeId) || "";
    const kind = getAccountKind(typeName);
    
    console.log(`  Processing account: ${account.name} (Kind: ${kind})`);
    
    let expectedUpdates: Partial<Account> = {};
    let hasVariance = false;
    const variances: string[] = [];

    // Fetch account-scoped ledger 
    // Optimization: query only the specific account ID where possible
    const expenses = await fetchCollection(uid, "expenses", "accountId", account.id);
    const payments = await fetchCollection(uid, "accountPayments");
    const filteredPayments = payments.filter((p: any) => p.fromAccountId === account.id || p.toAccountId === account.id);

    if (kind === "credit") {
      const bills = await fetchCollection(uid, "creditCardBills", "accountId", account.id);
      
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

      // Check variance
      for (const [key, expected] of Object.entries(expectedUpdates)) {
        const actual = (account as any)[key];
        if (actual !== expected && !(actual === undefined && expected === null)) {
          hasVariance = true;
          variances.push(`${key}: expected ${expected}, got ${actual}`);
        }
      }
      
    } else {
      const incomes = await fetchCollection(uid, "incomes", "accountId", account.id);
      const entries = await fetchCollection(uid, "accountEntries", "accountId", account.id);
      const transfers = await fetchCollection(uid, "transfers");
      const filteredTransfers = transfers.filter((t: any) => t.fromAccountId === account.id || t.toAccountId === account.id);
      
      // Note: runway/netWorth features might use borrowings and receivables, but they are rarely tied directly to a single account balance unless specifically linked.
      // computeBankBalance accepts them.
      const borrowings = await fetchCollection(uid, "borrowings");
      const filteredBorrowings = borrowings.filter((b: any) => b.accountId === account.id);
      
      const borrowingRepayments = await fetchCollection(uid, "borrowingRepayments");
      const filteredBorrowingRepayments = borrowingRepayments.filter((r: any) => r.accountId === account.id);

      const receivables = await fetchCollection(uid, "receivables");
      const filteredReceivables = receivables.filter((r: any) => r.accountId === account.id);
      
      const receivableRepayments = await fetchCollection(uid, "receivableRepayments");
      const filteredReceivableRepayments = receivableRepayments.filter((r: any) => r.accountId === account.id);

      const bal = computeBankBalance(
        account,
        expenses,
        incomes,
        filteredPayments,
        entries,
        filteredTransfers,
        filteredBorrowings,
        filteredBorrowingRepayments,
        filteredReceivables,
        filteredReceivableRepayments,
        todayDateKey()
      );

      expectedUpdates = {
        currentBalance: bal,
      };

      if (account.currentBalance !== bal) {
        hasVariance = true;
        variances.push(`currentBalance: expected ${bal}, got ${account.currentBalance}`);
      }
    }

    if (!hasVariance) {
      console.log(`    [OK] No variance.`);
    } else {
      console.log(`    [VARIANCE DETECTED]`);
      variances.forEach(v => console.log(`      - ${v}`));
      
      if (mode === "apply") {
        await doc.ref.update({
          ...expectedUpdates,
          balanceReconciliationStatus: "healthy",
          balanceLastRebuiltAt: new Date().toISOString(),
          // Use FieldValue.serverTimestamp() in actual SDK if needed, but ISO string matches the schema 'string'
        });
        console.log(`    [APPLIED] Document updated.`);
      }
    }
  }
}

async function run() {
  if (TARGET_UID) {
    await rebuildForUser(TARGET_UID);
  } else {
    // Run for all users
    const usersSnap = await db.collection("users").get();
    for (const userDoc of usersSnap.docs) {
      await rebuildForUser(userDoc.id);
    }
  }
  console.log("\nFinished.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
