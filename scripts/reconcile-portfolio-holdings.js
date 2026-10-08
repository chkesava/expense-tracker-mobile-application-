#!/usr/bin/env node

/**
 * SPENDLY-419 — historical backfill for `portfolioTransactions`.
 *
 * `createHoldingWithCash` (KAN-77 / SPENDLY-46) wrote the holding and, for a
 * cash-funded purchase, an `investmentCashTransactions` PURCHASE entry — but never
 * the matching `portfolioTransactions` BUY row that Order History and XIRR are
 * built from. A holding's aggregate quantity could then disagree with its visible
 * trade history (the reference case: a 40-share holding showing only 30 shares
 * across two BUY rows). That gap is now fixed going forward in
 * `services/portfolio/investmentCash.ts`; this script backfills data written
 * before the fix shipped.
 *
 * It intentionally performs only the unambiguous repair: a cash PURCHASE/SALE
 * entry exists for a holding but has no matching `portfolioTransactions` row. It
 * mirrors the authoritative matching logic in
 * shared/features/portfolio/utils/portfolioReconciliation.ts
 * (scanHoldingForFindings) — keep the two in sync. It never touches the cash
 * ledger, never fabricates a cash movement for a holding that has none, and never
 * deletes a document. The opposite gap (a holding that looks app-funded but has no
 * cash entry) is always ambiguous and is left to the in-app recalibration flow,
 * where a human confirms it per holding.
 *
 * Idempotent: a repeated run reports zero changes once applied — each backfilled
 * row uses the deterministic id `recon_tx_<holdingId>_<cashEntryId>`, the same
 * scheme the in-app flow uses, so a script run and a later in-app rerun for the
 * same user converge and never duplicate a row.
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT
 * (same as scripts/backfill-ganesh-admin-count.js).
 *
 * Usage:
 *   node scripts/reconcile-portfolio-holdings.js                 # dry run (default)
 *   node scripts/reconcile-portfolio-holdings.js --user <uid>    # one user only
 *   node scripts/reconcile-portfolio-holdings.js --apply         # write the fixes
 *
 * Always read the dry-run report — and get the user's explicit go-ahead, since
 * this is the shared dev/prod Firebase project with no staging — before passing
 * --apply.
 */

const { initializeApp, getApps, applicationDefault, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return cert(JSON.parse(raw));
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault();
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents."
  );
}

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Mirrors transactionDerivedQuantity/hasMatchingTransaction in portfolioReconciliation.ts. */
function executedBuysAndSells(transactions) {
  return transactions.filter(
    (tx) => (tx.type === "BUY" || tx.type === "SELL") && tx.orderStatus !== "cancelled"
  );
}

function hasMatchingTransaction(entry, transactions) {
  const type = entry.type === "PURCHASE" ? "BUY" : "SELL";
  return transactions.some(
    (tx) =>
      tx.type === type &&
      round(tx.quantity) === round(entry.quantity) &&
      round(tx.price) === round(entry.price) &&
      tx.date === entry.date
  );
}

/** Mirrors scanHoldingForFindings's `missing_buy_recoverable_from_cash` branch only. */
function recoverableGapsFor(holding, transactions, cashEntries) {
  const holdingQty = round(holding.quantity);
  const tradeTxs = executedBuysAndSells(transactions.filter((tx) => tx.holdingId === holding.id));
  const txQty = round(
    tradeTxs.reduce((sum, tx) => sum + (tx.type === "SELL" ? -tx.quantity : tx.quantity), 0)
  );
  const qtyGap = round(holdingQty - txQty);
  if (Math.abs(qtyGap) <= 1e-9) return [];

  const unmatched = cashEntries.filter(
    (entry) =>
      entry.holdingId === holding.id &&
      (entry.type === "PURCHASE" || entry.type === "SALE") &&
      !hasMatchingTransaction(entry, tradeTxs)
  );

  return unmatched.map((entry) => ({
    transactionId: `recon_tx_${holding.id}_${entry.id}`,
    holdingId: holding.id,
    symbol: holding.symbol,
    type: entry.type === "PURCHASE" ? "BUY" : "SELL",
    quantity: Math.abs(Number(entry.quantity) || 0),
    price: Number(entry.price) || 0,
    date: entry.date,
    sourceCashEntryId: entry.id,
  }));
}

async function reconcileUser(userRef, { apply, runId }) {
  const [holdingsSnap, txSnap, cashSnap] = await Promise.all([
    userRef.collection("holdings").get(),
    userRef.collection("portfolioTransactions").get(),
    userRef.collection("investmentCashTransactions").get(),
  ]);
  if (holdingsSnap.empty) return { repaired: 0 };

  const holdings = holdingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cashEntries = cashSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const repairs = holdings.flatMap((holding) =>
    recoverableGapsFor(holding, transactions, cashEntries)
  );
  if (repairs.length === 0) return { repaired: 0 };

  for (const repair of repairs) {
    console.log(
      `  ${userRef.id}/portfolioTransactions/${repair.transactionId}  ${repair.type} ${repair.quantity} @ ${repair.price} on ${repair.date} (from cash entry ${repair.sourceCashEntryId})`
    );
  }

  if (apply) {
    const batch = userRef.firestore.batch();
    for (const repair of repairs) {
      batch.set(userRef.collection("portfolioTransactions").doc(repair.transactionId), {
        holdingId: repair.holdingId,
        symbol: repair.symbol,
        type: repair.type,
        quantity: repair.quantity,
        price: repair.price,
        fees: 0,
        date: repair.date,
        orderStatus: "executed",
        createdAt: new Date(),
      });
    }
    batch.set(userRef.collection("portfolioReconciliationAudits").doc(runId), {
      runId,
      startedAt: new Date().toISOString(),
      completedAt: new Date(),
      triggeredBy: "admin_backfill",
      findingsCount: repairs.length,
      repairedCount: repairs.length,
      skippedCount: 0,
      repairs: repairs.map((r) => ({
        findingId: `missing_buy_recoverable_from_cash:${r.holdingId}:${r.sourceCashEntryId}`,
        holdingId: r.holdingId,
        symbol: r.symbol,
        type: "missing_buy_recoverable_from_cash",
        transactionId: r.transactionId,
        cashEntryId: r.sourceCashEntryId,
      })),
      source: "script",
    });
    await batch.commit();
  }

  return { repaired: repairs.length };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const userIndex = process.argv.indexOf("--user");
  const onlyUserId = userIndex >= 0 ? process.argv[userIndex + 1] : null;
  const runId = `recon_run_${Date.now()}`;

  const app = getApps().length ? getApps()[0] : initializeApp({ credential: loadCredential() });
  const db = getFirestore(app);

  const userRefs = onlyUserId
    ? [db.collection("users").doc(onlyUserId)]
    : await db.collection("users").listDocuments();

  let totalRepaired = 0;
  let usersTouched = 0;

  for (const userRef of userRefs) {
    const result = await reconcileUser(userRef, { apply, runId });
    if (result.repaired > 0) usersTouched += 1;
    totalRepaired += result.repaired;
  }

  console.log("");
  console.log(`${usersTouched} user(s) affected. ${totalRepaired} missing BUY/SELL row(s) recovered from cash entries.`);
  console.log(apply ? "Applied." : "Dry run — nothing was written. Re-run with --apply to write these changes.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
