import { beforeEach, describe, expect, it } from "vitest";

import {
  detectRecurringPatterns,
  filterPatternsForReview,
  type RecurringExpenseInput,
} from "@/services/sms/smsRecurringDetector";
import {
  declineRecurringSuggestion,
  peekHydratedSubscriptionsForTests,
  rememberDeletedSubscription,
  rememberHydratedSubscriptions,
  resetHydratedSubscriptionsForTests,
} from "@/services/sms/smsRecurringSync";
import {
  enqueueRecurringSuggestions,
  loadDismissedRecurringKeys,
  loadRecurringSuggestions,
  merchantKeyFromDismissedEntry,
  mergeRecurringSuggestions,
  resetSmsRecurringStoreForTests,
} from "@/services/sms/smsRecurringStore";
import { parseLocalDate, toLocalDateKey } from "@/shared/utils/dates";

function everyNDays(
  note: string,
  amount: number,
  start: string,
  count: number,
  step: number
): RecurringExpenseInput[] {
  const items: RecurringExpenseInput[] = [];
  const date = parseLocalDate(start);
  for (let i = 0; i < count; i++) {
    items.push({
      amount,
      date: toLocalDateKey(date),
      note,
      category: "Food",
    });
    date.setDate(date.getDate() + step);
  }
  return items;
}

describe("recurring suggestion inbox", () => {
  beforeEach(() => {
    resetSmsRecurringStoreForTests();
    resetHydratedSubscriptionsForTests();
  });

  it("strips legacy merchant|amount dismiss keys", () => {
    expect(merchantKeyFromDismissedEntry("chicken|200.00")).toBe("chicken");
    expect(merchantKeyFromDismissedEntry("netflix")).toBe("netflix");
  });

  it("enqueues a detected pattern instead of creating a subscription", async () => {
    const pattern = detectRecurringPatterns(
      everyNDays("Chicken", 200, "2026-08-01", 8, 2)
    )[0]!;
    const { added } = await enqueueRecurringSuggestions([pattern]);
    expect(added).toHaveLength(1);
    expect(await loadRecurringSuggestions()).toEqual([pattern]);
  });

  it("does not re-add an already queued pattern", async () => {
    const pattern = detectRecurringPatterns(
      everyNDays("Chicken", 200, "2026-08-01", 8, 2)
    )[0]!;
    await enqueueRecurringSuggestions([pattern]);
    const second = mergeRecurringSuggestions([pattern], [pattern]);
    expect(second.added).toHaveLength(0);
    expect(second.items).toHaveLength(1);
  });

  it("decline remembers the merchant so a later detect is not queued", async () => {
    const pattern = detectRecurringPatterns(
      everyNDays("Chicken", 200, "2026-08-01", 8, 2)
    )[0]!;
    await enqueueRecurringSuggestions([pattern]);
    await declineRecurringSuggestion(undefined, pattern);

    expect(await loadRecurringSuggestions()).toHaveLength(0);
    expect(await loadDismissedRecurringKeys()).toContain("chicken");

    const again = detectRecurringPatterns(
      everyNDays("Chicken", 220, "2026-08-01", 8, 2)
    );
    expect(
      filterPatternsForReview(again, [], await loadDismissedRecurringKeys())
    ).toHaveLength(0);
  });

  it("deleting a subscription dismisses that merchant", async () => {
    await rememberDeletedSubscription(undefined, { name: "Chicken" });
    expect(await loadDismissedRecurringKeys()).toContain("chicken");
  });

  it("reuses the shared subscription list instead of a fresh getDocs", () => {
    rememberHydratedSubscriptions([
      { id: "sub-1", name: "Netflix" } as never,
    ]);
    expect(peekHydratedSubscriptionsForTests()?.[0]?.id).toBe("sub-1");
    resetHydratedSubscriptionsForTests();
    expect(peekHydratedSubscriptionsForTests()).toBeNull();
  });
});
