/**
 * SPENDLY-523: per-record balance reconciliation for ONE bank/cash account.
 *
 * READ-ONLY. There is no --apply: this never writes to Firestore. It explains
 * a stored `currentBalance` that disagrees with the ledger, row by row, so a
 * repair (scripts/rebuild-financial-summaries.ts --accountId=… --apply) is
 * only run once the variance is understood.
 *
 *   npx tsx scripts/reconcile-account-ledger.ts --uid=<uid> --accountId=<id> \
 *     [--real-balance=29429] [--out=report.md]
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT, as
 * in the rebuild scripts. With FIRESTORE_EMULATOR_HOST set it reads the local
 * emulator (project GCLOUD_PROJECT, default demo-spendly) and needs none.
 *
 * The report prints account ids but never the uid, so it can be pasted into
 * docs/ as is.
 */
import { writeFileSync } from "node:fs";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { computeBankBalance } from "../shared/utils/accountBalance";
import { effectiveBalanceAsOfDate } from "../shared/utils/accountBaseline";
import { todayDateKey } from "../shared/utils/dates";
import {
  accountBalanceContributions,
  balanceFromContributions,
  type AccountContribution,
  type LedgerRow,
} from "../shared/utils/ledgerAccountDeltas";
import { roundMoney } from "../shared/utils/money";
import type { Account } from "../shared/types/expense";

function initApp() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" });
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return initializeApp({ credential: cert(JSON.parse(raw)) });
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault() });
  }
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents (or FIRESTORE_EMULATOR_HOST for the emulator)."
  );
}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

const UID = arg("uid");
const ACCOUNT_ID = arg("accountId");
const REAL_BALANCE = arg("real-balance");
const OUT = arg("out");

type Doc = Record<string, any> & { id: string };

/** Firestore Timestamp | ISO string | missing → ISO string or "". */
function isoOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const v = value as { toDate?: () => Date };
  return typeof v.toDate === "function" ? v.toDate().toISOString() : "";
}

/** Write paths that, before SPENDLY-523, never moved `currentBalance`. */
function unappliedPathTag(kind: LedgerRow["kind"], row: Doc): string | null {
  if (kind === "accountEntry" && row.transferId) return "investment-cash transfer";
  const note = String(row.note ?? "");
  if (kind === "expense" && (row.subscriptionId || /^\[(Subscription|EMI)\]/.test(note))) {
    return "subscription due-post";
  }
  if (kind === "accountTransfer" && (row.subscriptionId || row.recurringTransfer || /^\[Auto-Transfer\]/.test(note))) {
    return "recurring transfer due-post";
  }
  return null;
}

const money = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  if (!UID || !ACCOUNT_ID) {
    throw new Error("Usage: --uid=<uid> --accountId=<accountId> [--real-balance=N] [--out=file]");
  }
  const db = getFirestore(initApp());
  const user = db.collection("users").doc(UID);
  const read = async (name: string): Promise<Doc[]> =>
    (await user.collection(name).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

  const accountSnap = await user.collection("accounts").doc(ACCOUNT_ID).get();
  if (!accountSnap.exists) throw new Error(`Account ${ACCOUNT_ID} not found`);
  const account = { id: accountSnap.id, ...accountSnap.data() } as unknown as Account & Doc;

  const [expenses, incomes, payments, entries, transfers, borrowings, borrowingRepayments, receivables, receivableRepayments] =
    await Promise.all([
      read("expenses"), read("incomes"), read("accountPayments"), read("accountEntries"),
      read("accountTransfers"), read("borrowings"), read("borrowingRepayments"),
      read("receivables"), read("receivableRepayments"),
    ]);

  const rows: LedgerRow[] = [
    ...expenses.map((row) => ({ kind: "expense", row }) as LedgerRow),
    ...incomes.map((row) => ({ kind: "income", row }) as LedgerRow),
    ...payments.map((row) => ({ kind: "accountPayment", row }) as LedgerRow),
    ...entries.map((row) => ({ kind: "accountEntry", row }) as LedgerRow),
    ...transfers.map((row) => ({ kind: "accountTransfer", row }) as LedgerRow),
    ...borrowings.map((row) => ({ kind: "borrowing", row }) as LedgerRow),
    ...borrowingRepayments.map((row) => ({ kind: "borrowingRepayment", row }) as LedgerRow),
    ...receivables.map((row) => ({ kind: "receivable", row }) as LedgerRow),
    ...receivableRepayments.map((row) => ({ kind: "receivableRepayment", row }) as LedgerRow),
  ];
  const byKey = new Map<string, Doc>();
  for (const r of rows) byKey.set(`${r.kind}:${r.row.id}`, r.row as unknown as Doc);

  const today = todayDateKey();
  const contributions = accountBalanceContributions(account, rows, today).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      isoOf(byKey.get(`${a.kind}:${a.id}`)?.createdAt).localeCompare(isoOf(byKey.get(`${b.kind}:${b.id}`)?.createdAt)) ||
      a.id.localeCompare(b.id)
  );
  const recomputed = balanceFromContributions(account, contributions);
  const crossCheck = computeBankBalance(
    account, expenses as any, incomes as any, payments as any, entries as any, transfers as any,
    borrowings as any, borrowingRepayments as any, receivables as any, receivableRepayments as any, today
  );
  const stored = typeof account.currentBalance === "number" ? account.currentBalance : null;
  const lastRebuilt = isoOf(account.balanceLastRebuiltAt);

  const lines: string[] = [];
  const out = (s = "") => lines.push(s);
  out(`# Account ledger reconciliation: ${account.name} (${account.id})`);
  out();
  out(`Generated ${new Date().toISOString()} (read-only, nothing was written).`);
  out();
  out("| Field | Value |");
  out("|---|---|");
  out(`| Opening balance | ${money(account.openingBalance ?? 0)} |`);
  out(`| Baseline (balanceAsOfDate) | ${effectiveBalanceAsOfDate(account.balanceAsOfDate, [], today) ?? "none (Creation: full ledger)"} |`);
  out(`| balanceInitialized | ${String(account.balanceInitialized)} |`);
  out(`| balanceReconciliationStatus | ${String(account.balanceReconciliationStatus)} |`);
  out(`| summaryReconciliationStatus | ${String((account as Doc).summaryReconciliationStatus)} |`);
  out(`| balanceLastRebuiltAt | ${lastRebuilt || "never"} |`);
  out(`| Stored currentBalance | ${stored === null ? "missing" : money(stored)} |`);
  out(`| Recomputed from ledger | ${money(recomputed)} (computeBankBalance: ${money(crossCheck)}) |`);
  if (stored !== null) out(`| Stored − recomputed | ${money(roundMoney(stored - recomputed))} |`);
  if (REAL_BALANCE) out(`| Real balance (user) | ${money(Number(REAL_BALANCE))} |`);
  if (REAL_BALANCE) out(`| Recomputed − real | ${money(roundMoney(recomputed - Number(REAL_BALANCE)))} |`);
  out(`| Contributing rows | ${contributions.length} |`);
  if (recomputed !== crossCheck) {
    out();
    out("**WARNING:** per-row sum disagrees with computeBankBalance; the helper is out of sync.");
  }

  // Rows from the two paths that skipped the balance op. Only those written
  // after the last rebuild can still be missing from the stored balance.
  const suspects: Array<AccountContribution & { tag: string; createdAt: string; sinceRebuild: boolean }> = [];
  for (const c of contributions) {
    const row = byKey.get(`${c.kind}:${c.id}`)!;
    const tag = unappliedPathTag(c.kind, row);
    if (!tag) continue;
    const createdAt = isoOf(row.createdAt);
    suspects.push({ ...c, tag, createdAt, sinceRebuild: !lastRebuilt || !createdAt || createdAt > lastRebuilt });
  }
  const suspectSum = roundMoney(
    suspects.filter((s) => s.sinceRebuild).reduce((sum, s) => sum + s.amountDelta, 0)
  );
  out();
  out("## Rows from write paths that skipped the balance update (before SPENDLY-523)");
  out();
  out("| Date | Kind | Id | Delta | Tag | Created | After last rebuild |");
  out("|---|---|---|---|---|---|---|");
  for (const s of suspects) {
    out(`| ${s.date} | ${s.kind} | ${s.id} | ${money(s.amountDelta)} | ${s.tag} | ${s.createdAt || "?"} | ${s.sinceRebuild ? "yes" : "no"} |`);
  }
  out();
  out(`Expected overstatement from these rows (after last rebuild): ${money(-suspectSum)}`);
  if (stored !== null) {
    out(`Unexplained remainder: ${money(roundMoney(stored - recomputed + suspectSum))}`);
  }

  // Statement re-import double-apply candidates (createExpense merge + increment).
  const fingerprints = new Map<string, number>();
  for (const e of expenses) {
    if (e.accountId === account.id && e.statementImportFingerprint) {
      fingerprints.set(e.statementImportFingerprint, (fingerprints.get(e.statementImportFingerprint) ?? 0) + 1);
    }
  }
  const imported = expenses.filter((e) => e.accountId === account.id && e.statementImportFingerprint).length;
  out();
  out(`Statement-imported expenses on this account: ${imported}. A re-import of the same line lands on the same doc id and applies its delta again; those cannot be seen from the ledger alone.`);

  out();
  out("## Every contributing row");
  out();
  out("| # | Date | Kind | Id | Note | Delta | Running balance |");
  out("|---|---|---|---|---|---|---|");
  let running = account.openingBalance ?? 0;
  contributions.forEach((c, i) => {
    running = roundMoney(running + c.amountDelta);
    const note = String(byKey.get(`${c.kind}:${c.id}`)?.note ?? "").replace(/\|/g, "/").slice(0, 40);
    out(`| ${i + 1} | ${c.date} | ${c.kind} | ${c.id} | ${note} | ${money(c.amountDelta)} | ${money(running)} |`);
  });

  const text = lines.join("\n") + "\n";
  if (OUT) {
    writeFileSync(OUT, text, "utf8");
    console.log(`Report written to ${OUT}`);
  }
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
