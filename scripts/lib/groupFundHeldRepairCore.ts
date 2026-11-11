/**
 * SPENDLY-752 — which group funds store a per-account held split that their
 * history no longer explains, and what it should be.
 *
 * Before 752 a payout took held money only from the paying account, so paying
 * more than that account held left it below zero and the other accounts still
 * showing money "held for others" (Hand cash ₹500 after the whole fund was
 * paid out from SBI). The fixed rule (`allocatePayoutDraw`) is replayed over
 * each fund's full history by `rebuildGroupFundTotals`.
 *
 * Pure: no Firestore. The CLI (scripts/repair-group-fund-held.ts) reads, and
 * writes only with --apply.
 *
 * A fund is repaired only when the correction is proven: every stored total
 * and per-purpose figure already equals the history, and only `heldByAccount`
 * differs. Anything else is left unchanged and reported for manual review.
 * Events, account entries and balances are never touched.
 */
import type { GroupFund, GroupFundEvent } from "../../shared/types/groupFund";
import { rebuildGroupFundTotals, reconcileGroupFund, type GroupFundDifference } from "../../shared/utils/groupFundMath";
import { roundMoney } from "../../shared/utils/money";

export type HeldRepairStatus = "ok" | "repair" | "manual";

export type HeldRepairFund = {
  /** Opaque owner key for the report (never the uid). */
  ownerKey: string;
  fundId: string;
  fundName: string;
  version: number;
  status: HeldRepairStatus;
  /** Why it is `manual`. */
  reason?: string;
  stored: Record<string, number>;
  /** The map to write (`repair` only): every stored or rebuilt account, 0 when none is held. */
  proposed?: Record<string, number>;
  /** Differences outside heldByAccount (`manual`). */
  otherDifferences: GroupFundDifference[];
  eventCount: number;
};

/** Events in the order their increments were applied: creation time, then id. */
export function replayOrder(events: readonly GroupFundEvent[]): GroupFundEvent[] {
  return [...events].sort((a, b) => a.createdAtMs - b.createdAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function planHeldRepair(
  ownerKey: string,
  fund: Pick<GroupFund, "id" | "name" | "version" | "totals" | "byPurpose" | "heldByAccount">,
  events: readonly GroupFundEvent[]
): HeldRepairFund {
  const ordered = replayOrder(events.filter((e) => e.fundId === fund.id));
  const stored = { ...(fund.heldByAccount ?? {}) };
  const base = {
    ownerKey,
    fundId: fund.id,
    fundName: fund.name,
    version: fund.version ?? 0,
    stored,
    eventCount: ordered.length,
  };
  const diffs = reconcileGroupFund(fund, ordered);
  if (diffs.length === 0) {
    // Matches its history but still below zero somewhere: two devices paid out
    // from stale copies at once. The history doesn't say which split is right.
    if (Object.values(stored).some((v) => v < -0.005)) {
      return { ...base, status: "manual", reason: "an account holds less than nothing even by its history (payouts from two devices at once?)", otherDifferences: [] };
    }
    return { ...base, status: "ok", otherDifferences: [] };
  }
  const other = diffs.filter((d) => !d.field.startsWith("heldByAccount."));
  if (other.length > 0) {
    return {
      ...base,
      status: "manual",
      reason: "stored totals don't match the event history, so the right split can't be proven",
      otherDifferences: other,
    };
  }
  const rebuilt = rebuildGroupFundTotals(ordered).heldByAccount;
  const proposed: Record<string, number> = {};
  for (const id of new Set([...Object.keys(stored), ...Object.keys(rebuilt)])) {
    proposed[id] = roundMoney(rebuilt[id] ?? 0);
  }
  if (Object.values(proposed).some((v) => v < -0.005)) {
    return { ...base, status: "manual", reason: "the replayed split still has an account below zero", otherDifferences: [] };
  }
  return { ...base, status: "repair", proposed, otherDifferences: [] };
}

export type AccountImpact = { accountId: string; before: number; after: number };

/**
 * Per account, held for others before and after, summed over the planned
 * funds, as the account card shows it (never below zero).
 */
export function accountImpact(funds: readonly HeldRepairFund[]): AccountImpact[] {
  const before = new Map<string, number>();
  const after = new Map<string, number>();
  for (const f of funds) {
    if (f.status !== "repair" || !f.proposed) continue;
    for (const [id, v] of Object.entries(f.stored)) before.set(id, roundMoney((before.get(id) ?? 0) + v));
    for (const [id, v] of Object.entries(f.proposed)) after.set(id, roundMoney((after.get(id) ?? 0) + v));
  }
  return [...new Set([...before.keys(), ...after.keys()])]
    .map((accountId) => ({ accountId, before: before.get(accountId) ?? 0, after: after.get(accountId) ?? 0 }))
    .filter((r) => Math.abs(r.before - r.after) > 0.005)
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));
}

const sum = (m: Record<string, number>) => roundMoney(Object.values(m).reduce((s, v) => s + v, 0));
const money = (n: number) => n.toFixed(2);
const shown = (n: number) => money(Math.max(0, n));

/** Markdown report; account names come from `accountName` (ids when unknown). Never prints a uid. */
export function renderHeldRepairReport(
  funds: readonly HeldRepairFund[],
  accountName: (ownerKey: string, accountId: string) => string,
  opts: { mode: "dry-run" | "apply"; applied?: Map<string, string> }
): string {
  const count = (s: HeldRepairStatus) => funds.filter((f) => f.status === s).length;
  const lines = [
    `# SPENDLY-752 group fund held-by-account repair — ${opts.mode}`,
    "",
    `Funds checked: ${funds.length} · already correct: ${count("ok")} · to repair: ${count("repair")} · manual review: ${count("manual")}`,
    "",
  ];
  const repairs = funds.filter((f) => f.status === "repair");
  if (repairs.length) {
    lines.push("## Funds to repair (only heldByAccount changes)", "");
    for (const f of repairs) {
      const tag = opts.applied?.get(`${f.ownerKey}/${f.fundId}`);
      lines.push(`### ${f.fundName} (owner ${f.ownerKey}, fund ${f.fundId}, v${f.version}, ${f.eventCount} events)${tag ? ` — ${tag}` : ""}`, "");
      lines.push("| Account | Stored | Proposed | Card shows before → after |", "|---|---:|---:|---|");
      for (const id of Object.keys(f.proposed!).sort()) {
        const before = f.stored[id] ?? 0;
        const after = f.proposed![id];
        lines.push(`| ${accountName(f.ownerKey, id)} | ${money(before)} | ${money(after)} | ${shown(before)} → ${shown(after)} |`);
      }
      lines.push("", `Sum of accounts: ${money(sum(f.stored))} → ${money(sum(f.proposed!))} (the fund's held total is unchanged)`, "");
    }
    lines.push("## Account-wise impact (held for others, summed over repaired funds)", "");
    lines.push("| Owner | Account | Before | After |", "|---|---|---:|---:|");
    const byOwner = new Map<string, HeldRepairFund[]>();
    for (const f of repairs) byOwner.set(f.ownerKey, [...(byOwner.get(f.ownerKey) ?? []), f]);
    for (const [owner, list] of byOwner) {
      for (const r of accountImpact(list)) {
        lines.push(`| ${owner} | ${accountName(owner, r.accountId)} | ${money(r.before)} | ${money(r.after)} |`);
      }
    }
    lines.push("");
  }
  const manual = funds.filter((f) => f.status === "manual");
  if (manual.length) {
    lines.push("## Manual review (left unchanged)", "");
    for (const f of manual) {
      lines.push(`- ${f.fundName} (owner ${f.ownerKey}, fund ${f.fundId}): ${f.reason}`);
      for (const d of f.otherDifferences.slice(0, 10)) lines.push(`  - ${d.field}: stored ${money(d.stored)}, history ${money(d.expected)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
