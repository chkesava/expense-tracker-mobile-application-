/**
 * SPENDLY-799 (epic SPENDLY-793): the on-device fallback for low-balance
 * alerts, for phones that don't get push (`usePushReminderMode()` is "local").
 *
 * - **Plans from the stored result only** (`serverResults/autoDebitShortfall`,
 *   written by autodebit-daily). Nothing is computed here (epic 735 rule).
 *   A shortfall short today is assumed short through its due day. The phone
 *   can't re-check at fire time, so the plan is rebuilt whenever the stored
 *   result changes. A top-up or edit re-runs the server job within about a
 *   minute (796), and the next plan drops what's covered.
 * - **Once a day** from `dueDate − leadDays` (or today, if later) through the
 *   due day, at 09:00 local clamped into the user's window. Same words as the
 *   push, which hide amounts unless `showAmounts` is on.
 * - **Nothing** for an untrusted balance, a result more than a day old, a
 *   past due day, or the switch off.
 * - **Stable ids:** `lowbal:{key}@{fireDate}`. Rebuilding with the same plan
 *   never duplicates.
 *
 * Pure.
 */

import type { ShortfallItem } from "./autoDebitShortfall";
import { shiftDateKey } from "./dates";
import { lowBalanceUrl } from "./lowBalanceDisplay";
import { debitKey, lowBalanceCopy } from "./push/sources/lowBalanceSource";
import type { StoredAutoDebitShortfall } from "./serverResults";

export const LOW_BALANCE_NOTIFICATION_PREFIX = "lowbal:";

export type PlannedLowBalanceNotification = {
  id: string;
  fireDate: string;
  title: string;
  body: string;
  url: string;
};

export function planLowBalanceNotifications(input: {
  stored: StoredAutoDebitShortfall | null;
  today: string;
  enabled: boolean;
  showAmounts: boolean;
  currency: string;
}): PlannedLowBalanceNotification[] {
  const { stored, today } = input;
  if (!input.enabled || !stored || stored.today < shiftDateKey(today, -1)) return [];
  const out: PlannedLowBalanceNotification[] = [];
  for (const account of stored.accounts ?? []) {
    if (!account.trusted) continue;
    for (const item of (account.items ?? []) as ShortfallItem[]) {
      if (typeof item.shortBy !== "number" || item.shortBy <= 0 || item.dueDate < today) continue;
      const debit = { ...item, accountName: account.accountName };
      const key = debitKey(item);
      const start = shiftDateKey(item.dueDate, -item.leadDays);
      for (let day = start > today ? start : today; day <= item.dueDate; day = shiftDateKey(day, 1)) {
        const copy = lowBalanceCopy(debit, { today: day, showAmounts: input.showAmounts, currency: input.currency });
        out.push({ id: `${LOW_BALANCE_NOTIFICATION_PREFIX}${key}@${day}`, fireDate: day, title: copy.title, body: copy.body, url: lowBalanceUrl(item) });
      }
    }
  }
  return out.sort((a, b) => a.fireDate.localeCompare(b.fireDate) || a.id.localeCompare(b.id));
}
