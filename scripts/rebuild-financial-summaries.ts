import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  computeBankBalance,
  computeOutstandingCredit,
  borrowingsCreditedTo,
  repaymentsPaidFrom,
  receivablesPaidFrom,
  receivableRepaymentsInto,
} from "../shared/utils/accountBalance";
import { getAccountKind } from "../shared/utils/accountKind";
import type { Account } from "../shared/types/expense";

// Minimal shim for `todayDateKey` if needed, or import it.
import { todayDateKey } from "../shared/utils/dates";
import { planCardRebuild } from "../shared/utils/reconciliation";

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

    let staleFields: string[] = [];
    if (kind === "credit") {
      const bills = await fetchCollection(uid, "creditCardBills", "accountId", account.id);
      // SPENDLY-497: refunds, transfers and adjustments move a card too.
      const cardIncomes = await fetchCollection(uid, "incomes", "accountId", account.id);
      const cardEntries = await fetchCollection(uid, "accountEntries", "accountId", account.id);
      const cardTransfers = (await fetchCollection(uid, "accountTransfers")).filter(
        (t: any) => t.fromAccountId === account.id || t.toAccountId === account.id
      );
      const usage = computeOutstandingCredit(account, expenses, filteredPayments, bills, todayDateKey(), {
        incomes: cardIncomes,
        entries: cardEntries,
        transfers: cardTransfers,
      });
      const plan = planCardRebuild(
        account as unknown as Record<string, unknown>,
        usage.totalOutstanding,
        usage.unappliedCredit
      );
      expectedUpdates = { currentOutstanding: plan.currentOutstanding };
      staleFields = plan.staleFields;
      variances.push(...plan.variances);
      if (plan.staleFields.length > 0) variances.push(`stale derived fields to clear: ${plan.staleFields.join(", ")}`);
      hasVariance = plan.needsWrite;
    } else {
      const incomes = await fetchCollection(uid, "incomes", "accountId", account.id);
      const entries = await fetchCollection(uid, "accountEntries", "accountId", account.id);
      // SPENDLY-436: the real collection is "accountTransfers" — "transfers"
      // doesn't exist, so transfers were always silently invisible here.
      const transfers = await fetchCollection(uid, "accountTransfers");
      const filteredTransfers = transfers.filter((t: any) => t.fromAccountId === account.id || t.toAccountId === account.id);
      
      // SPENDLY-436: Borrowing/Receivable records relate to an account via
      // their own named field (creditedAccountId / paymentAccountId /
      // sourceAccountId / receivedAccountId) — there is no generic
      // "accountId" on any of these four collections.
      const borrowings = await fetchCollection(uid, "borrowings");
      const filteredBorrowings = borrowingsCreditedTo(account.id, borrowings as any);

      const borrowingRepayments = await fetchCollection(uid, "borrowingRepayments");
      const filteredBorrowingRepayments = repaymentsPaidFrom(account.id, borrowingRepayments as any);

      const receivables = await fetchCollection(uid, "receivables");
      const filteredReceivables = receivablesPaidFrom(account.id, receivables as any);

      const receivableRepayments = await fetchCollection(uid, "receivableRepayments");
      const filteredReceivableRepayments = receivableRepaymentsInto(account.id, receivableRepayments as any);

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
          ...(kind === "credit" ? { summaryReconciliationStatus: "healthy" } : {}),
          ...Object.fromEntries(staleFields.map((field) => [field, FieldValue.delete()])),
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
