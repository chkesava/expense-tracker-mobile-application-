import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { calculateAccountBalances, calculateEpfSummary, calculateDashboardSummaries, calculateNetWorthSummary } from "../shared/utils/reconciliation";
import {
  borrowingsCreditedTo,
  repaymentsPaidFrom,
  receivablesPaidFrom,
  receivableRepaymentsInto,
} from "../shared/utils/accountBalance";
import { summarizeBorrowings } from "../shared/utils/borrowingMath";
import { summarizeReceivables } from "../shared/utils/receivableMath";
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
const overrideZeros = args.includes("--override-zeros");
const uidArg = args.find((a) => a.startsWith("--uid="));
const TARGET_UID = uidArg ? uidArg.split("=")[1] : null;

async function fetchCollection(uid: string, colName: string) {
  try {
    const snap = await db.collection("users").doc(uid).collection(colName).get();
    return { docs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[], success: true };
  } catch (err) {
    console.error(`Failed to fetch ${colName} for user ${uid}:`, err);
    return { docs: [], success: false };
  }
}

async function rebuildForUser(uid: string) {
  console.log(`\n======================================================`);
  console.log(`Rebuilding summaries for user: ${uid} (Mode: ${mode})`);
  console.log(`======================================================`);
  
  const collections = [
    "accountTypes", "accounts", "expenses", "incomes", "accountPayments",
    // SPENDLY-436: the real collection is "accountTransfers" — "transfers"
    // doesn't exist, so it always silently returned zero documents and
    // every transfer was invisible to the account-balance recalculation.
    "accountEntries", "accountTransfers", "borrowings", "borrowingRepayments",
    "receivables", "receivableRepayments", "creditCardBills",
    "investments", "holdings", "epfEstablishments", "epfContributions",
    "epfTransfers", "epfInterestEntries", "epfReconciliations"
  ];
  
  const data: Record<string, any[]> = {};
  let allQueriesSucceeded = true;
  let totalSourceDocs = 0;

  console.log(`\n--- Source Document Coverage ---`);
  for (const col of collections) {
    const res = await fetchCollection(uid, col);
    data[col] = res.docs;
    totalSourceDocs += res.docs.length;
    if (!res.success) allQueriesSucceeded = false;
    console.log(`  - users/${uid}/${col}: ${res.docs.length} documents found`);
  }
  
  if (!allQueriesSucceeded) {
    console.warn(`\n[WARNING] Some queries failed. Halting rebuild for this user to prevent data corruption.`);
    return;
  }
  
  const typeMap = new Map<string, string>();
  data.accountTypes.forEach(d => typeMap.set(d.id, d.name));

  const today = todayDateKey();
  
  let totalWrites = 0;
  const batch = db.batch();

  // 1. Account Balances
  console.log(`\n--- 1. Account Balances ---`);
  for (const account of data.accounts) {
    const updates = calculateAccountBalances({
      account,
      typeName: typeMap.get(account.typeId) || "",
      expenses: data.expenses.filter(e => e.accountId === account.id),
      incomes: data.incomes.filter(i => i.accountId === account.id),
      payments: data.accountPayments.filter(p => p.fromAccountId === account.id || p.toAccountId === account.id),
      transfers: data.accountTransfers.filter(t => t.fromAccountId === account.id || t.toAccountId === account.id),
      entries: data.accountEntries.filter(e => e.accountId === account.id),
      // SPENDLY-436: match via each collection's own relation field
      // (creditedAccountId / paymentAccountId / sourceAccountId /
      // receivedAccountId) — none of these have a generic "accountId".
      borrowings: borrowingsCreditedTo(account.id, data.borrowings),
      borrowingRepayments: repaymentsPaidFrom(account.id, data.borrowingRepayments),
      receivables: receivablesPaidFrom(account.id, data.receivables),
      receivableRepayments: receivableRepaymentsInto(account.id, data.receivableRepayments),
      bills: data.creditCardBills.filter(b => b.accountId === account.id),
      today
    });

    let hasVariance = false;
    for (const [key, expected] of Object.entries(updates)) {
      if (account[key] !== expected && !(account[key] === undefined && expected === undefined)) {
        console.log(`  [Variance] Account ${account.id} (${account.name}) ${key}: existing ${account[key]}, recalculated ${expected}`);
        hasVariance = true;
      }
    }
    
    if (!hasVariance) console.log(`  [OK] Account ${account.id} (${account.name}) is fully reconciled.`);

    // SPENDLY-436: the Net Worth Summary step below reads `data.accounts`.
    // Without this, it would compute liabilities/assets from the stale
    // pre-rebuild balances even in the same run that just recalculated them
    // correctly above — giving an internally inconsistent report in both
    // dry-run and apply mode.
    Object.assign(account, updates);

    if (hasVariance && mode === "apply") {
      batch.update(db.doc(`users/${uid}/accounts/${account.id}`), { ...updates, balanceLastRebuiltAt: FieldValue.serverTimestamp() });
      totalWrites++;
    }
  }

  // Fetch existing financial summaries to check for false zero overwrites
  const existingEpf = await db.doc(`users/${uid}/financialSummaries/epf`).get();
  const existingNw = await db.doc(`users/${uid}/financialSummaries/netWorth`).get();

  // 2. EPF Summary
  console.log(`\n--- 2. EPF Summary ---`);
  const epfUpdates = calculateEpfSummary({
    establishments: data.epfEstablishments,
    contributions: data.epfContributions,
    transfers: data.epfTransfers,
    interestEntries: data.epfInterestEntries,
    adjustments: data.epfReconciliations
  });
  
  let epfBlocked = false;
  if (existingEpf.exists) {
    const oldEpf = existingEpf.data();
    if (oldEpf?.currentBalance > 0 && epfUpdates.currentBalance === 0) {
      console.warn(`  [WARNING] Suspicious zero! Existing EPF balance is ${oldEpf.currentBalance}, but recalculated is 0.`);
      if (!overrideZeros) {
        console.warn(`  [BLOCKED] Skipping EPF apply. Use --override-zeros to force overwrite.`);
        epfBlocked = true;
      } else {
        console.warn(`  [OVERRIDE] Forcing zero overwrite because --override-zeros was passed.`);
      }
    }
  }
  console.log(`  Candidate EPF Updates:`, epfUpdates);

  if (mode === "apply" && !epfBlocked) {
    batch.set(db.doc(`users/${uid}/financialSummaries/epf`), {
      ...epfUpdates,
      summaryVersion: 1,
      sourceDocumentCount: data.epfEstablishments.length + data.epfContributions.length + data.epfTransfers.length + data.epfInterestEntries.length + data.epfReconciliations.length,
      calculatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    totalWrites++;
  }

  // 3. Dashboard Summaries
  console.log(`\n--- 3. Dashboard Summaries ---`);
  const dashboards = calculateDashboardSummaries(data.expenses, data.incomes);
  console.log(`  Found ${dashboards.size} active dashboard periods.`);
  for (const [period, dash] of dashboards.entries()) {
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
  console.log(`\n--- 4. Net Worth Summary ---`);
  // SPENDLY-436: Borrowing/Receivable have no `.amount`/`.amountPaid` fields.
  // Reuse the same portfolio aggregators the live app uses (summarizeBorrowings
  // / summarizeReceivables), which already fall back to dynamic calculation
  // for interest-bearing or non-backfilled records.
  const borrowingOutstanding = summarizeBorrowings(data.borrowings, data.borrowingRepayments, today).totalOutstanding;
  const receivableOutstanding = summarizeReceivables(data.receivables, data.receivableRepayments, today).totalOutstanding;
  
  const nwUpdates = calculateNetWorthSummary({
    accounts: data.accounts,
    typeMap,
    expenses: data.expenses,
    incomes: data.incomes,
    payments: data.accountPayments,
    bills: data.creditCardBills,
    entries: data.accountEntries,
    transfers: data.accountTransfers,
    borrowings: data.borrowings,
    borrowingRepayments: data.borrowingRepayments,
    receivables: data.receivables,
    receivableRepayments: data.receivableRepayments,
    borrowingOutstanding,
    receivableOutstanding,
    investments: data.investments,
    holdings: data.holdings,
    quotes: new Map(),
    investmentCashBalance: 0,
    epfValue: epfUpdates.currentBalance || 0,
    epfUnreconciledCount: 0,
    today
  });
  
  let nwBlocked = false;
  if (existingNw.exists) {
    const oldNw = existingNw.data();
    if (oldNw?.netWorth !== 0 && nwUpdates.netWorth === 0) {
      console.warn(`  [WARNING] Suspicious zero! Existing net worth is ${oldNw.netWorth}, but recalculated is 0.`);
      if (!overrideZeros) {
        console.warn(`  [BLOCKED] Skipping Net Worth apply. Use --override-zeros to force overwrite.`);
        nwBlocked = true;
      } else {
        console.warn(`  [OVERRIDE] Forcing zero overwrite because --override-zeros was passed.`);
      }
    }
  }
  
  console.log(`  Candidate Net Worth Updates:`, nwUpdates);
  
  if (mode === "apply" && !nwBlocked) {
    batch.set(db.doc(`users/${uid}/financialSummaries/netWorth`), {
      ...nwUpdates,
      summaryVersion: 1,
      sourceDocumentCount: totalSourceDocs,
      calculatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    totalWrites++;
  }
  
  if (mode === "apply" && totalWrites > 0) {
    console.log(`\n  Committing ${totalWrites} operations...`);
    await batch.commit();
    console.log(`  Done.`);
  } else if (mode === "dryRun") {
    console.log(`\n  [DRY RUN] Would have committed ${totalWrites} operations.`);
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
  console.log("\nGlobal Rebuild Finished.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

