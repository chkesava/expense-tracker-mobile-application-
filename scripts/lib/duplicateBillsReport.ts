/**
 * SPENDLY-728 — read-only report on credit-card bills duplicated by the
 * legacy site's `credit-card-bills` cron (random `.doc()` ids, SPENDLY-676).
 * Pure; the CLI (scripts/report-duplicate-bills.ts) loads the docs. Nothing
 * here writes, and the report never prints a uid.
 *
 * For each user it groups bills by card and statement date, classifies each
 * bill (the app's deterministic id `${accountId}_${statementDate}` or a
 * random legacy id; cancelled or open) and shows what the app's own duplicate
 * resolution (`collectCreditBillDuplicateResolutions`, the rule the bill pass
 * and the server bill job apply) keeps and cancels. It also counts open
 * random-id bills with no twin: legacy bills the app never made.
 */

import type { CreditCardBill } from "../../shared/types/creditCardBill";
import { autoCreditCardBillDocId } from "../../shared/utils/autoCreditCardBills";
import { collectCreditBillDuplicateResolutions } from "../../shared/utils/creditCardLedger";
import { roundMoney } from "../../shared/utils/money";

export type BillLine = {
  id: string;
  kind: "app id" | "legacy random id";
  status: string;
  statementAmount: number;
  amountPaid: number;
  verdict: "keep" | "cancel" | "already cancelled";
};
export type BillGroup = { accountId: string; statementDate: string; bills: BillLine[] };
export type UserBillDuplicates = {
  userTag: string;
  groups: BillGroup[];
  openLegacyOnly: Array<{ id: string; accountId: string; statementDate: string; status: string; statementAmount: number }>;
  totals: { bills: number; legacyIds: number; groups: number; wouldCancel: number };
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function duplicateBillsForUser(userTag: string, bills: CreditCardBill[], today: string): UserBillDuplicates {
  const isApp = (b: CreditCardBill) => b.id === autoCreditCardBillDocId(b.accountId, b.statementDate);
  const resolutions = collectCreditBillDuplicateResolutions(bills, today);
  const cancel = new Set(resolutions.flatMap((r) => r.cancelIds));

  const byCycle = new Map<string, CreditCardBill[]>();
  for (const b of bills) {
    const key = `${b.accountId}|${b.statementDate}`;
    byCycle.set(key, [...(byCycle.get(key) ?? []), b]);
  }
  const groups: BillGroup[] = [];
  const openLegacyOnly: UserBillDuplicates["openLegacyOnly"] = [];
  for (const [key, list] of [...byCycle.entries()].sort()) {
    const [accountId, statementDate] = key.split("|");
    if (list.length === 1) {
      const b = list[0];
      if (!isApp(b) && b.status !== "CANCELLED" && b.status !== "PAID") {
        openLegacyOnly.push({ id: b.id, accountId, statementDate, status: String(b.status), statementAmount: roundMoney(num(b.statementAmount)) });
      }
      continue;
    }
    groups.push({
      accountId,
      statementDate,
      bills: list
        .map((b): BillLine => ({
          id: b.id,
          kind: isApp(b) ? "app id" : "legacy random id",
          status: String(b.status),
          statementAmount: roundMoney(num(b.statementAmount)),
          amountPaid: roundMoney(num(b.amountPaid)),
          verdict: b.status === "CANCELLED" ? "already cancelled" : cancel.has(b.id) ? "cancel" : "keep",
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
  }
  return {
    userTag,
    groups,
    openLegacyOnly,
    totals: {
      bills: bills.length,
      legacyIds: bills.filter((b) => !isApp(b)).length,
      groups: groups.length,
      wouldCancel: cancel.size,
    },
  };
}

export function renderDuplicateBillsReport(users: UserBillDuplicates[], generatedAt: string): string {
  const out: string[] = [];
  out.push("# Duplicate credit-card bills report (SPENDLY-728)", "", `Generated ${generatedAt} (read-only, nothing was written). Users are shown as hashes.`, "");
  const sum = (f: (u: UserBillDuplicates) => number) => users.reduce((n, u) => n + f(u), 0);
  out.push(
    `Users: ${users.length}. Bills: ${sum((u) => u.totals.bills)}, of which legacy random ids: ${sum((u) => u.totals.legacyIds)}. Cycles with more than one bill: ${sum((u) => u.totals.groups)}. Open duplicates the app's rule would cancel: ${sum((u) => u.totals.wouldCancel)}. Open legacy-only bills: ${sum((u) => u.openLegacyOnly.length)}.`,
    ""
  );
  for (const u of users) {
    if (!u.groups.length && !u.openLegacyOnly.length) continue;
    out.push(`## ${u.userTag}`, "");
    if (u.groups.length) {
      out.push("| Card | Statement | Bill | Id kind | Status | Billed ₹ | Paid ₹ | App rule |", "|---|---|---|---|---|---|---|---|");
      for (const g of u.groups) {
        for (const b of g.bills) out.push(`| ${g.accountId} | ${g.statementDate} | ${b.id} | ${b.kind} | ${b.status} | ${b.statementAmount} | ${b.amountPaid} | ${b.verdict} |`);
      }
      out.push("");
    }
    if (u.openLegacyOnly.length) {
      out.push("Open legacy-only bills (no app twin):", "", "| Card | Statement | Bill | Status | Billed ₹ |", "|---|---|---|---|---|");
      for (const b of u.openLegacyOnly) out.push(`| ${b.accountId} | ${b.statementDate} | ${b.id} | ${b.status} | ${b.statementAmount} |`);
      out.push("");
    }
  }
  out.push("Any repair needs its own ticket, a dry run and the owner's approval (AGENT_WORKFLOW §7). The app's bill pass and the server bill job (SPENDLY-727) apply the same rule automatically for cards they process.");
  return out.join("\n");
}
