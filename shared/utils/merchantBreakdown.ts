import type { Expense } from "@/shared/types/expense";
import type { MerchantOverride } from "@/shared/types/merchant";
import { buildMerchantLedgerItems, merchantProfileId } from "@/shared/utils/merchantGrouping";

/**
 * SPENDLY-579 — who the money in a set of rows went to, using the merchant
 * recognition the app already has (SPENDLY-186: `buildMerchantLedgerItems`,
 * the user's corrections applied). Rows the resolver could not name are one
 * honest "Not recognised" bucket rather than many one-off strings presented as
 * merchants. Pure; derived only, nothing is stored.
 */

export const UNRECOGNISED_MERCHANT = "__unrecognised__";

export type MerchantShare = {
  /** `merchantProfileId(...)`, or `UNRECOGNISED_MERCHANT`. */
  id: string;
  name: string;
  amount: number;
  count: number;
  /** Share of the rows' total, 0–100. */
  percentage: number;
  recognised: boolean;
};

export function merchantBreakdown(
  rows: readonly Expense[],
  overrides: readonly MerchantOverride[] = []
): { merchants: MerchantShare[]; total: number; merchantOf: Map<string, string> } {
  const items = buildMerchantLedgerItems(rows, [], overrides);
  const groups = new Map<string, MerchantShare>();
  const merchantOf = new Map<string, string>();
  for (const item of items) {
    const recognised = Boolean(item.resolution.merchantId);
    const id = recognised ? merchantProfileId(item.resolution) : UNRECOGNISED_MERCHANT;
    merchantOf.set(item.id, id);
    const group =
      groups.get(id) ??
      { id, name: recognised ? item.resolution.displayName : "Not recognised", amount: 0, count: 0, percentage: 0, recognised };
    group.amount += item.amount;
    group.count += 1;
    groups.set(id, group);
  }
  const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const merchants = [...groups.values()]
    .map((g) => ({ ...g, amount: Math.round(g.amount * 100) / 100, percentage: total > 0 ? (g.amount / total) * 100 : 0 }))
    // Recognised merchants by amount; the unrecognised bucket always last.
    .sort((a, b) => Number(b.recognised) - Number(a.recognised) || b.amount - a.amount);
  return { merchants, total, merchantOf };
}

/** Rows that went to one merchant (or to the unrecognised bucket). */
export function rowsForMerchant(rows: readonly Expense[], merchantOf: ReadonlyMap<string, string>, merchantId: string): Expense[] {
  return rows.filter((r) => r.id && merchantOf.get(r.id) === merchantId);
}
