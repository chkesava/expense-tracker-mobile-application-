/**
 * SPENDLY-728 — read-only report on SIP data drift left by the legacy site's
 * `sip-execute` cron (SPENDLY-682). Pure; the CLI (scripts/report-sip-drift.ts)
 * loads the docs. Nothing here writes, and the report never prints a uid.
 *
 * The record of what executed is the `sipTransactions` rows with
 * `status: "executed"`. Against it the report checks:
 * - per fund (quoteKey): the app's `virtualPositions` and the legacy
 *   `virtualPortfolio` (id = quoteKey with non [A-Za-z0-9_-] → "_");
 * - per plan: its stored totals vs its own executed rows (the legacy cron
 *   wrote the *position's* totals onto the plan, wrong when two plans share
 *   a fund);
 * - double executions: one plan and scheduled date executed more than once
 *   (e.g. a legacy random-id row and an app `{sipId}_{date}` row).
 */

import { roundMoney } from "../../shared/utils/money";

export type Row = Record<string, unknown> & { id: string };
export type UserSipDocs = { userTag: string; plans: Row[]; transactions: Row[]; positions: Row[]; legacyPositions: Row[] };

const EPS_UNITS = 1e-6;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Appends `row` to `map[key]` (the CLIs group docs by owner with this). */
export function groupInto<T>(map: Map<string, T[]>, key: string, row: T): void {
  const list = map.get(key);
  if (list) list.push(row);
  else map.set(key, [row]);
}

/** The legacy cron's position id for a quote key. */
export function legacyPositionId(quoteKey: string): string {
  return quoteKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 700);
}

/** True for the app's deterministic id `{sipId}_{YYYY-MM-DD}`. */
export function isAppTxId(tx: Row): boolean {
  const sipId = String(tx.sipId ?? "");
  return Boolean(sipId) && new RegExp(`^${sipId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_\\d{4}-\\d{2}-\\d{2}$`).test(tx.id);
}

export type FundLine = {
  quoteKey: string;
  executedUnits: number;
  executedInvested: number;
  appUnits: number | null;
  appInvested: number | null;
  legacyUnits: number | null;
  legacyInvested: number | null;
  appMatches: boolean;
  legacyMatches: boolean;
};
export type PlanLine = {
  planId: string;
  assetName: string;
  storedUnits: number;
  storedInvested: number;
  storedCount: number;
  executedUnits: number;
  executedInvested: number;
  executedCount: number;
  matches: boolean;
};
export type DoubleRun = { planId: string; date: string; txIds: string[] };
export type UserSipDrift = {
  userTag: string;
  funds: FundLine[];
  plans: PlanLine[];
  doubleRuns: DoubleRun[];
  txCounts: { executed: number; appIds: number; legacyIds: number; failed: number; skipped: number };
};

export function sipDriftForUser(u: UserSipDocs): UserSipDrift {
  const executed = u.transactions.filter((t) => t.status === "executed");
  const byFund = new Map<string, { units: number; invested: number }>();
  const byPlan = new Map<string, { units: number; invested: number; count: number }>();
  const runs = new Map<string, string[]>();
  for (const t of executed) {
    const key = String(t.quoteKey ?? "");
    const f = byFund.get(key) ?? { units: 0, invested: 0 };
    f.units += num(t.unitsPurchased);
    f.invested += num(t.investmentAmount);
    byFund.set(key, f);
    const sipId = String(t.sipId ?? "");
    const p = byPlan.get(sipId) ?? { units: 0, invested: 0, count: 0 };
    p.units += num(t.unitsPurchased);
    p.invested += num(t.investmentAmount);
    p.count += 1;
    byPlan.set(sipId, p);
    const runKey = `${sipId}|${String(t.date ?? "")}`;
    runs.set(runKey, [...(runs.get(runKey) ?? []), t.id]);
  }

  const appByKey = new Map(u.positions.map((p) => [String(p.quoteKey ?? p.id), p]));
  const legacyById = new Map(u.legacyPositions.map((p) => [p.id, p]));
  const fundKeys = new Set<string>([...byFund.keys(), ...appByKey.keys(), ...u.legacyPositions.map((p) => String(p.quoteKey ?? p.id))]);
  const funds: FundLine[] = [...fundKeys].filter(Boolean).sort().map((quoteKey) => {
    const ex = byFund.get(quoteKey) ?? { units: 0, invested: 0 };
    const app = appByKey.get(quoteKey);
    const legacy = legacyById.get(legacyPositionId(quoteKey));
    const appUnits = app ? num(app.totalUnits) : null;
    const legacyUnits = legacy ? num(legacy.totalUnits) : null;
    return {
      quoteKey,
      executedUnits: r4(ex.units),
      executedInvested: roundMoney(ex.invested),
      appUnits: appUnits == null ? null : r4(appUnits),
      appInvested: app ? roundMoney(num(app.totalInvested)) : null,
      legacyUnits: legacyUnits == null ? null : r4(legacyUnits),
      legacyInvested: legacy ? roundMoney(num(legacy.totalInvested)) : null,
      appMatches: (appUnits ?? 0) >= ex.units - EPS_UNITS && (appUnits ?? 0) <= ex.units + EPS_UNITS,
      legacyMatches: legacyUnits == null || Math.abs(legacyUnits - ex.units) <= EPS_UNITS,
    };
  });

  const plans: PlanLine[] = u.plans.map((p) => {
    const ex = byPlan.get(p.id) ?? { units: 0, invested: 0, count: 0 };
    const storedUnits = num(p.totalUnits);
    const storedInvested = num(p.totalInvested);
    const storedCount = num(p.executionCount);
    return {
      planId: p.id,
      assetName: String(p.assetName ?? ""),
      storedUnits: r4(storedUnits),
      storedInvested: roundMoney(storedInvested),
      storedCount,
      executedUnits: r4(ex.units),
      executedInvested: roundMoney(ex.invested),
      executedCount: ex.count,
      matches:
        Math.abs(storedUnits - ex.units) <= EPS_UNITS &&
        Math.abs(storedInvested - ex.invested) < 0.005 &&
        storedCount === ex.count,
    };
  });

  const doubleRuns: DoubleRun[] = [...runs.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([k, txIds]) => ({ planId: k.split("|")[0], date: k.split("|")[1], txIds: txIds.sort() }));

  return {
    userTag: u.userTag,
    funds,
    plans,
    doubleRuns,
    txCounts: {
      executed: executed.length,
      appIds: executed.filter(isAppTxId).length,
      legacyIds: executed.filter((t) => !isAppTxId(t)).length,
      failed: u.transactions.filter((t) => t.status === "failed").length,
      skipped: u.transactions.filter((t) => t.status === "skipped").length,
    },
  };
}

const cell = (v: number | null) => (v == null ? "—" : String(v));

export function renderSipDriftReport(users: UserSipDrift[], generatedAt: string): string {
  const out: string[] = [];
  out.push("# SIP drift report (SPENDLY-728)", "", `Generated ${generatedAt} (read-only, nothing was written). Users are shown as hashes.`, "");
  const withIssues = users.filter((u) => u.funds.some((f) => !f.appMatches || !f.legacyMatches) || u.plans.some((p) => !p.matches) || u.doubleRuns.length);
  out.push(`Users with SIP data: ${users.length}; with drift: ${withIssues.length}.`, "");
  for (const u of users) {
    out.push(`## ${u.userTag}`, "");
    out.push(
      `Executed rows: ${u.txCounts.executed} (app ids ${u.txCounts.appIds}, legacy random ids ${u.txCounts.legacyIds}); failed ${u.txCounts.failed}; skipped ${u.txCounts.skipped}.`,
      ""
    );
    out.push("### Funds: executed rows vs positions", "", "| Quote key | Executed units | Executed ₹ | virtualPositions units | ₹ | virtualPortfolio (legacy) units | ₹ | App ok | Legacy ok |", "|---|---|---|---|---|---|---|---|---|");
    for (const f of u.funds) {
      out.push(`| ${f.quoteKey} | ${f.executedUnits} | ${f.executedInvested} | ${cell(f.appUnits)} | ${cell(f.appInvested)} | ${cell(f.legacyUnits)} | ${cell(f.legacyInvested)} | ${f.appMatches ? "yes" : "**no**"} | ${f.legacyMatches ? "yes" : "**no**"} |`);
    }
    out.push("", "### Plans: stored totals vs their own executed rows", "", "| Plan | Asset | Stored units | Stored ₹ | Stored runs | Executed units | Executed ₹ | Executed runs | Ok |", "|---|---|---|---|---|---|---|---|---|");
    for (const p of u.plans) {
      out.push(`| ${p.planId} | ${p.assetName} | ${p.storedUnits} | ${p.storedInvested} | ${p.storedCount} | ${p.executedUnits} | ${p.executedInvested} | ${p.executedCount} | ${p.matches ? "yes" : "**no**"} |`);
    }
    if (u.doubleRuns.length) {
      out.push("", "### Double executions (same plan and date, more than one executed row)", "", "| Plan | Date | Row ids |", "|---|---|---|");
      for (const d of u.doubleRuns) out.push(`| ${d.planId} | ${d.date} | ${d.txIds.join(", ")} |`);
    }
    out.push("");
  }
  out.push("Any repair needs its own ticket, a dry run and the owner's approval (AGENT_WORKFLOW §7).");
  return out.join("\n");
}
