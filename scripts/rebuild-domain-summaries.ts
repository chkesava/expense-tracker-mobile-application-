import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { calculateAccountBalances, calculateEpfSummary, calculateDashboardSummaries, calculateNetWorthSummary } from "../shared/utils/reconciliation";
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
const TARGET_UID = uidArg ? uidArg.split("=")[1] : null;

async function fetchCollection(uid: string, colName: string) {
  const snap = await db.collection("users").doc(uid).collection(colName).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
}

async function rebuildForUser(uid: string) {
  console.log(`\nRebuilding summaries for user: ${uid} (Mode: ${mode})`);
  
  const typeMap = new Map<string, string>();
  const typesSnap = await db.collection("users").doc(uid).collection("accountTypes").get();
  typesSnap.forEach(d => typeMap.set(d.id, d.data().name));

  const accounts = await fetchCollection(uid, "accounts");
  const expenses = await fetchCollection(uid, "expenses");
  const incomes = await fetchCollection(uid, "incomes");
  const payments = await fetchCollection(uid, "accountPayments");
  const entries = await fetchCollection(uid, "accountEntries");
  const transfers = await fetchCollection(uid, "transfers");
  const borrowings = await fetchCollection(uid, "borrowings");
  const borrowingRepayments = await fetchCollection(uid, "borrowingRepayments");
  const receivables = await fetchCollection(uid, "receivables");
  const receivableRepayments = await fetchCollection(uid, "receivableRepayments");
  const bills = await fetchCollection(uid, "creditCardBills");

  const investments = await fetchCollection(uid, "investments");
  const holdings = await fetchCollection(uid, "holdings");
  
  const epfEstablishments = await fetchCollection(uid, "epfEstablishments");
  const epfContributions = await fetchCollection(uid, "epfContributions");
  const epfTransfers = await fetchCollection(uid, "epfTransfers");
  const epfInterestEntries = await fetchCollection(uid, "epfInterestEntries");
  const epfAdjustments = await fetchCollection(uid, "epfReconciliations");

  const today = todayDateKey();
  
  let totalWrites = 0;
  const batch = db.batch();

  // 1. Account Balances
  for (const account of accounts) {
    const updates = calculateAccountBalances({
      account,
      typeName: typeMap.get(account.typeId) || "",
      expenses: expenses.filter(e => e.accountId === account.id),
      incomes: incomes.filter(i => i.accountId === account.id),
      payments: payments.filter(p => p.fromAccountId === account.id || p.toAccountId === account.id),
      transfers: transfers.filter(t => t.fromAccountId === account.id || t.toAccountId === account.id),
      entries: entries.filter(e => e.accountId === account.id),
      borrowings: borrowings.filter(b => b.accountId === account.id),
      borrowingRepayments: borrowingRepayments.filter(r => r.accountId === account.id),
      receivables: receivables.filter(r => r.accountId === account.id),
      receivableRepayments: receivableRepayments.filter(r => r.accountId === account.id),
      bills: bills.filter(b => b.accountId === account.id),
      today
    });

    let hasVariance = false;
    for (const [key, expected] of Object.entries(updates)) {
      if (account[key] !== expected && !(account[key] === undefined && expected === undefined)) {
        console.log(`    [Account: ${account.id}] ${key} variance: expected ${expected}, got ${account[key]}`);
        hasVariance = true;
      }
    }

    if (hasVariance && mode === "apply") {
      batch.update(db.doc(`users/${uid}/accounts/${account.id}`), { ...updates, balanceLastRebuiltAt: FieldValue.serverTimestamp() });
      totalWrites++;
    }
  }

  // 2. EPF Summary
  const epfUpdates = calculateEpfSummary({
    establishments: epfEstablishments,
    contributions: epfContributions,
    transfers: epfTransfers,
    interestEntries: epfInterestEntries,
    adjustments: epfAdjustments
  });
  console.log(`    [EPF] Summary calculated:`, epfUpdates);
  if (mode === "apply") {
    batch.set(db.doc(`users/${uid}/financialSummaries/epf`), {
      ...epfUpdates,
      summaryVersion: 1,
      calculatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    totalWrites++;
  }

  // 3. Dashboard Summaries
  const dashboards = calculateDashboardSummaries(expenses, incomes);
  for (const [period, dash] of dashboards.entries()) {
    console.log(`    [Dashboard ${period}]`, dash);
    if (mode === "apply") {
      batch.set(db.doc(`users/${uid}/financialSummaries/dashboard_${period}`), {
        ...dash,
        summaryVersion: 1,
        calculatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      totalWrites++;
    }
  }

  // 4. Net Worth Summary
  const borrowingOutstanding = borrowings.reduce((sum, b) => sum + (b.amount - (b.amountPaid || 0)), 0);
  const receivableOutstanding = receivables.reduce((sum, r) => sum + (r.amount - (r.amountPaid || 0)), 0);
  
  // Note: investmentCashBalance should be extracted from investment rows if applicable
  const nwUpdates = calculateNetWorthSummary({
    accounts,
    typeMap,
    expenses,
    incomes,
    payments,
    bills,
    entries,
    transfers,
    borrowings,
    borrowingRepayments,
    receivables,
    receivableRepayments,
    borrowingOutstanding,
    receivableOutstanding,
    investments,
    holdings,
    quotes: new Map(),
    investmentCashBalance: 0,
    epfValue: epfUpdates.currentBalance || 0,
    epfUnreconciledCount: 0,
    today
  });
  console.log(`    [Net Worth]`, nwUpdates);
  
  if (mode === "apply") {
    batch.set(db.doc(`users/${uid}/financialSummaries/netWorth`), {
      ...nwUpdates,
      summaryVersion: 1,
      calculatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    totalWrites++;
    
    if (totalWrites > 0) {
      await batch.commit();
      console.log(`    Committed ${totalWrites} operations.`);
    }
  }
}

async function run() {
  if (TARGET_UID) {
    await rebuildForUser(TARGET_UID);
  } else {
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

