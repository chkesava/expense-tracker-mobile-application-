#!/usr/bin/env node

/**
 * SPENDLY-417 — historical backfill for `creditCardBills`.
 *
 * Two independent bugs let a fully-paid cycle keep showing OVERDUE:
 *
 *  1. A bill's stored `status` is trusted forever once written (the client
 *     only recomputed it when the field was missing). A write path that
 *     correctly updates `amountPaid` without recomputing `status` — or a
 *     status written before CreditCardBillsProvider always recomputed it on
 *     read — leaves the field stale.
 *  2. Duplicate docs for the same accountId+statementDate (SPENDLY-45): a
 *     payment linked to one duplicate never reaches the other.
 *
 * The app itself now self-heals both of these the next time each user opens
 * it (CreditCardBillsProvider.generateAutoBills, using
 * shared/utils/creditCardLedger.ts's collectCreditBillAllocationPatches /
 * collectCreditBillDuplicateResolutions against that user's own real
 * expenses/payments) — so this script exists only to fix what's already
 * wrong in Firestore *before* a user reopens the app, for an immediate
 * production check after the fix ships. It intentionally does NOT re-derive
 * the full payment ledger (that logic is non-trivial and already covered,
 * tested, and kept in one place in shared/utils/creditCardLedger.ts — hand-
 * porting it here would duplicate it and risk drifting out of sync). It only
 * performs the two corrections that need nothing but each bill's own stored
 * fields:
 *
 *   - status-only fix: recompute `status` from the bill's own stored
 *     `amountPaid`/`statementAmount`/`dueDate` when it disagrees and the
 *     correct answer is PAID or PARTIALLY_PAID (never forces a pure date
 *     transition like UPCOMING -> OVERDUE, mirroring the client's guard);
 *   - duplicate merge: for accountId+statementDate groups with more than one
 *     live doc, keep the one with the highest amountPaid as canonical (or
 *     the deterministic auto-bill id when present), union amountPaid/
 *     paymentIds onto it, and mark the rest CANCELLED.
 *
 * If a bill is actually unpaid in Firestore because a payment was recorded
 * off-band (not yet linked at all), this script leaves it untouched — only
 * the app's own ledger run, with that user's real expense/payment rows, can
 * safely decide that. Never deletes a document, never touches
 * `accountPayments`.
 *
 * Idempotent: a repeated run reports zero changes once applied.
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT
 * (same as scripts/backfill-ganesh-admin-count.js).
 *
 * Usage:
 *   node scripts/reconcile-credit-card-bill-payments.js                 # dry run (default)
 *   node scripts/reconcile-credit-card-bill-payments.js --user <uid>    # one user only
 *   node scripts/reconcile-credit-card-bill-payments.js --apply         # write the fixes
 *
 * Always read the dry-run report before passing --apply against production.
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

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Mirrors shared/utils/creditCardBillStatus.ts computeCreditCardBillStatus. */
function computeStatus({ today, dueDate, amountPaid, statementAmount }) {
  const statement = round(Math.max(0, statementAmount));
  const paid = round(Math.max(0, amountPaid));
  if (statement > 0 && paid >= statement) return "PAID";
  if (paid > 0 && paid < statement) return "PARTIALLY_PAID";
  if (!dueDate) return "UPCOMING";
  if (today > dueDate) return "OVERDUE";
  if (today === dueDate) return "DUE_TODAY";
  return "UPCOMING";
}

/** Mirrors shared/utils/autoCreditCardBills.ts autoCreditCardBillDocId. */
function autoBillDocId(accountId, statementDate) {
  return `${accountId}_${statementDate}`;
}

function statusFixesFor(bills, today) {
  const fixes = [];
  for (const bill of bills) {
    if (bill.status === "CANCELLED") continue;
    const computed = computeStatus({
      today,
      dueDate: bill.dueDate,
      amountPaid: Number(bill.amountPaid) || 0,
      statementAmount: Number(bill.statementAmount) || 0,
    });
    if (computed === bill.status) continue;
    if (computed !== "PAID" && computed !== "PARTIALLY_PAID") continue;
    fixes.push({ id: bill.id, from: bill.status, to: computed });
  }
  return fixes;
}

function duplicateResolutionsFor(bills, today) {
  const groups = new Map();
  for (const bill of bills) {
    if (!bill.id || !bill.accountId || !bill.statementDate) continue;
    if (bill.status === "CANCELLED") continue;
    const key = `${bill.accountId}:${bill.statementDate}`;
    const group = groups.get(key);
    if (group) group.push(bill);
    else groups.set(key, [bill]);
  }

  const resolutions = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const deterministicId = autoBillDocId(group[0].accountId, group[0].statementDate);
    const canonical =
      group.find((bill) => bill.id === deterministicId) ||
      [...group].sort(
        (a, b) => (Number(b.amountPaid) || 0) - (Number(a.amountPaid) || 0) || a.id.localeCompare(b.id)
      )[0];

    const amountPaid = Math.max(...group.map((bill) => Number(bill.amountPaid) || 0));
    const paymentIds = [...new Set(group.flatMap((bill) => (bill.paymentIds || []).filter(Boolean)))];
    const status = computeStatus({
      today,
      dueDate: canonical.dueDate,
      amountPaid,
      statementAmount: Number(canonical.statementAmount) || 0,
    });
    const remainingAmount = round(Math.max(0, (Number(canonical.statementAmount) || 0) - amountPaid));

    const canonicalIds = (canonical.paymentIds || []).filter(Boolean);
    const canonicalUnchanged =
      (Number(canonical.amountPaid) || 0) === amountPaid &&
      canonical.status === status &&
      canonicalIds.length === paymentIds.length &&
      canonicalIds.every((id) => paymentIds.includes(id));

    const cancelIds = group.filter((bill) => bill.id !== canonical.id).map((bill) => bill.id);
    if (cancelIds.length === 0 && canonicalUnchanged) continue;

    resolutions.push({
      canonicalId: canonical.id,
      canonicalPatch: canonicalUnchanged ? null : { amountPaid, paymentIds, status, remainingAmount },
      cancelIds,
    });
  }
  return resolutions;
}

async function reconcileUser(userRef, { apply, today }) {
  const billsSnap = await userRef.collection("creditCardBills").get();
  const bills = billsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (bills.length === 0) return { statusFixes: 0, merges: 0, cancels: 0 };

  const fixes = statusFixesFor(bills, today);
  for (const fix of fixes) {
    console.log(`  ${userRef.id}/creditCardBills/${fix.id}  status ${fix.from} -> ${fix.to}`);
    if (apply) await userRef.collection("creditCardBills").doc(fix.id).update({ status: fix.to });
  }

  const resolutions = duplicateResolutionsFor(bills, today);
  let merges = 0;
  let cancels = 0;
  for (const resolution of resolutions) {
    if (resolution.canonicalPatch) {
      merges += 1;
      console.log(
        `  ${userRef.id}/creditCardBills/${resolution.canonicalId}  merge -> amountPaid=${resolution.canonicalPatch.amountPaid} status=${resolution.canonicalPatch.status}`
      );
      if (apply) {
        await userRef.collection("creditCardBills").doc(resolution.canonicalId).update({
          amountPaid: resolution.canonicalPatch.amountPaid,
          paymentIds: resolution.canonicalPatch.paymentIds,
          status: resolution.canonicalPatch.status,
          remainingAmount: resolution.canonicalPatch.remainingAmount,
        });
      }
    }
    for (const cancelId of resolution.cancelIds) {
      cancels += 1;
      console.log(`  ${userRef.id}/creditCardBills/${cancelId}  CANCEL (duplicate of ${resolution.canonicalId})`);
      if (apply) await userRef.collection("creditCardBills").doc(cancelId).update({ status: "CANCELLED" });
    }
  }

  return { statusFixes: fixes.length, merges, cancels };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const userIndex = process.argv.indexOf("--user");
  const onlyUserId = userIndex >= 0 ? process.argv[userIndex + 1] : null;
  const today = todayDateKey();

  const app = getApps().length ? getApps()[0] : initializeApp({ credential: loadCredential() });
  const db = getFirestore(app);

  const userRefs = onlyUserId ? [db.collection("users").doc(onlyUserId)] : await db.collection("users").listDocuments();

  let totalStatusFixes = 0;
  let totalMerges = 0;
  let totalCancels = 0;
  let usersTouched = 0;

  for (const userRef of userRefs) {
    const result = await reconcileUser(userRef, { apply, today });
    if (result.statusFixes + result.merges + result.cancels > 0) usersTouched += 1;
    totalStatusFixes += result.statusFixes;
    totalMerges += result.merges;
    totalCancels += result.cancels;
  }

  console.log("");
  console.log(
    `${usersTouched} user(s) affected. ${totalStatusFixes} status fix(es), ${totalMerges} duplicate merge(s), ${totalCancels} duplicate cancellation(s).`
  );
  console.log(apply ? "Applied." : "Dry run — nothing was written. Re-run with --apply to write these changes.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
