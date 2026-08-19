# Feature advancements — recurring & household money

> **Date:** 2026-08-19  
> **Status:** Backlog for follow-up chats. Phase 14 (review + day cadence + decline memory) is **shipped**.  
> **How to use:** In a new chat, say: *Implement item N from `docs/audits/FEATURE_ADVANCEMENTS.md`* (or “do the next slice”). Do not re-implement Phase 14.

Related spec: [`docs/PHASE_14_SMS_RECURRING.md`](../PHASE_14_SMS_RECURRING.md)

---

## Already shipped (do not redo)

Detected repeating purchases **no longer auto-create** Firestore subscriptions.

- Cadence is **monthly** (`dayOfMonth`) or **every N days** (`frequency: "every_n_days"`, `intervalDays`).
- Suggestions wait in a local inbox and show as **Needs review** on **Ledger → Subscriptions** only.
- **Review** opens `EditSubscriptionModal` (user can change frequency) then creates `source: "sms"` (no auto-post).
- **Decline** or **Delete** remembers the **folded merchant** locally and in `users/{uid}/recurringDismissals/{merchantKey}` so detection cannot loop.
- Manual **Add New** still auto-posts. Detected-accepted items skip auto-post (`source === "sms"` in `useSubscriptions`).

Key files:

| Area | Path |
|---|---|
| Types | `shared/types/subscription.ts` |
| Detection | `services/sms/smsRecurringDetector.ts` |
| Queue / decline | `services/sms/smsRecurringSync.ts`, `smsRecurringStore.ts`, `smsRecurringDismissals.ts` |
| Review UI | `components/subscriptions/SubscriptionsList.tsx`, `RecurringReviewItem.tsx` |
| Hook | `hooks/useRecurringSuggestions.ts` |
| Due / labels | `shared/utils/subscriptionProcessor.ts` |
| Manual form | `components/subscriptions/EditSubscriptionModal.tsx` |

The queue is **not** a separate route. Deep link from the notification is `/ledger?tab=subscriptions`.

---

## How another chat should work

1. Read this file and Phase 14. Confirm the item is still open (search the repo before adding parallel inboxes or a third frequency enum for “weekly”).
2. Implement **one numbered item** (or the recommended pair 1+2) unless the user asks for more.
3. After the phase: include a **Manual Testing Guide** and say which commands to run (`npx expo start` is enough unless native/Firestore rules deploy is required).
4. Do **not** add a new workspace, a full AI coach, or a first-class `weekly` frequency — every 7 days already covers weekly.

**Recommended first slice:** items **1 + 2** (surface the queue + skip this occurrence).

---

## 1. Make Needs review hard to miss

**Why:** The inbox is only on Ledger → Subscriptions. If the user never opens that tab, suggestions sit unseen. SMS review already has a header/dashboard count.

**Product**

- Badge or count on Dashboard (same pattern as SMS inbox: `useSmsReviewInbox` in `app/(app)/dashboard.tsx` and `components/Header.tsx`).
- Optional badge on the Ledger **Subscriptions** hub tab.
- Recurring Payments widget (`components/dashboard/SubscriptionsWidget.tsx`): line like “N to review”; tap still goes to `/ledger?tab=subscriptions`.

**Implementation notes**

- Reuse `useRecurringSuggestions().count`. Do not invent a second store.
- Mirror `formatDetectedCount` copy style if you add a helper (e.g. `1 recurring to review`).
- Notification already deep-links correctly; this is in-app surfacing only.

**Done when:** A user with a pending chicken/Netflix suggestion can see a count without opening Ledger first, and tapping it lands on Needs review.

---

## 2. Skip / snooze / already paid

**Why:** Pause stops *all* future posts. Delete dismisses the merchant forever. Real life needs “skip this chicken run” or “rent already hit via SMS this month.”

**Product**

- On an active subscription row (and/or edit modal): **Skip this occurrence**.
- Effect: advance `lastProcessed` (monthly `YYYY-MM`) or `lastProcessedDate` (every N days) as if the processor had posted, **without** writing an expense/transfer.
- Optional later: snooze until a date; “already paid” for `source: "sms"` is mostly skip.

**Implementation notes**

- Pure helper next to `evaluateSubscriptionDue` / `applyPostPlanToSubscriptions` in `shared/utils/subscriptionProcessor.ts` so skip and auto-post share the same “mark processed” rule.
- `useSubscriptions` already batches `lastProcessed` + `lastProcessedDate` on post; skip is an update with no expense write.
- Detected `source: "sms"` rows do not auto-post today — skip still matters for next-due labels and the widget.

**Done when:** Skipping rent in August does not create an expense, August is not due, September (or next interval) is.

---

## 3. Amount jitter for groceries

**Why:** Detection still groups **exact** `merchant|amount`. Chicken at ₹198 then ₹205 never becomes a pattern. Decline is already merchant-level; grouping is not.

**Product**

- For short cadence only (`every_n_days` candidates), allow ±10–15% or nearest ₹10/₹20 when grouping.
- Monthly bills (Netflix ₹649 vs ₹699) should still be amount-specific so a price hike can surface as a new review, unless an existing sub already matches the merchant (current skip-if-name-matches behavior in `filterPatternsForReview`).

**Implementation notes**

- Change grouping in `detectRecurringPatterns` (`services/sms/smsRecurringDetector.ts`). Keep `recurringPatternKey` for inbox identity; document the new key rule in tests.
- Do not weaken Swiggy 3×-in-one-week rejection.
- Tests: same merchant, amounts 198/205/202 every 2 days → one `every_n_days` pattern; Netflix 649 vs 699 across months may remain separate.

**Done when:** Slightly varying grocery amounts still suggest every N days; a one-week food binge still does not.

---

## 4. Upcoming calendar (14–30 days)

**Why:** Monthly commitment is one number. The user now has mixed cadences (rent on day 5, EMI on day 7, chicken every 2 days).

**Product**

- Dashboard (or Subscriptions) list: next 14–30 days of due items, soonest first.
- `getNextRenewalDate` in `subscriptionProcessor.ts` already exists; `SubscriptionsWidget` already sorts by `daysRemaining` but only shows 4 rows with no calendar grouping.

**Implementation notes**

- Prefer extending `SubscriptionsWidget` or a small `UpcomingRecurringWidget` over a new tab unless the list is long.
- Include active manual + detected rows (detected still have a next date even if they do not auto-post).
- Do not auto-create expenses from this view.

**Done when:** Opening Dashboard answers “what hits this week?” without opening Ledger.

---

## 5. Recurring stats tab (already stubbed)

**Why:** `subscriptionsTab: "recurring" | "stats"` in `providers/LedgerStateProvider.tsx` is unused. `SubscriptionsList` has no stats UI.

**Product**

- Wire Active list vs **Stats** on Ledger → Subscriptions.
- Stats ideas: this month vs last month recurring spend; detected vs manual count; grocery `amount * (30 / intervalDays)` (already in `computeMonthlyCommitments`).

**Implementation notes**

- `setSubscriptionsTab` is in ledger state; Ledger hub may still not expose it — add pills on `SubscriptionsList` rather than a new route.
- Keep Needs review visible on both sub-tabs (or at least on `recurring`).

**Done when:** User can switch to Stats and see commitment breakdown without leaving Subscriptions.

---

## 6. Link SMS / ledger expenses to a subscription after Accept

**Why:** After Review, Netflix is a subscription row, but historical (and new SMS) expenses stay unlinked `Entertainment` lines. `Expense.subscriptionId` / `isRecurring` already exist.

**Product**

- On accept: optionally backfill recent matching expenses with `subscriptionId`.
- Going forward: if a new SMS/manual expense matches an active sub (folded name + amount tolerance), set `subscriptionId` so ledger grouping and “already paid this cycle” work.

**Implementation notes**

- Match using `matchesExistingMerchant` / `matchesExistingSubscription` in `smsRecurringDetector.ts`.
- Do not double-post: keep `source: "sms"` skip in `useSubscriptions`.
- Skip this occurrence (item 2) pairs well: SMS landed → mark cycle paid.

**Done when:** Accepting Netflix tags past/new Netflix expenses with that subscription id; no second auto expense.

---

## 7. Category budgets vs recurring commitments

**Why:** Budgets (`useCategoryBudgets`, dashboard `BudgetAlertsWidget`) and recurring totals (`computeMonthlyCommitments`) are separate. Rent + EMI + chicken-equivalent can already consume Housing/Food before the month starts.

**Product**

- When setting or viewing a category budget, show “₹X already committed by recurring in this category.”
- Smart insight if commitments ≥ 80% of that category budget.

**Implementation notes**

- Map subscription `category` onto budget categories; interval items already convert to monthly equivalent in `computeMonthlyCommitments`.
- [`docs/PHASE_15_SMART_INSIGHTS.md`](../PHASE_15_SMART_INSIGHTS.md) — extend sentences, do not replace Quick Insights.

**Done when:** User sees committed vs budget before they overspend the category.

---

## 8. Credit-card cycle vs subscriptions

**Why:** Cards and bill reminders exist (`credit-card-bills`, `accountId` on subscriptions). Recurring charges on a card should show on that cycle.

**Product**

- On a card bill / account detail: “These recurring items hit this card this cycle.”
- Optional: warn if a due date is after the statement close.

**Implementation notes**

- Filter active subs by `accountId` matching the card.
- Reuse billing-cycle helpers in `shared/utils/accountBalance.ts` (timezone caveat is in the audit log — follow `settings.timezone` if you touch “today”).

**Done when:** Opening a card bill lists linked recurring names/amounts for that cycle.

---

## 9. Yearly / quarterly frequency

**Why:** Insurance, Amazon Prime, vehicle tax. Phase 14 skipped this; weekly is already `intervalDays: 7`.

**Product**

- Extend `SubscriptionFrequency` with `quarterly` | `yearly` (or `every_n_months`).
- Form: keep EMI monthly; allow yearly on subscription type.
- Detection: median gap ~90 or ~365 days with the same consistency rules.

**Implementation notes**

- `lastProcessed` as `YYYY-MM` can still work for quarterly/yearly; do not break monthly.
- Commitments: yearly → `amount / 12`, quarterly → `amount / 3`.

**Done when:** User can add “insurance, every year, day 15 of March” and next-due / commitments are correct.

---

## 10. Shared / family review (later)

**Why:** Spaces (`PHASE_18`) and vaults exist; recurring is personal (`users/{uid}/subscriptions`). House rent detected on one person’s SMS could be a Home space cost.

**Product**

- On Review: “Add to space …” optional. Decline stays personal (do not dismiss for other members unless they share dismissals).

**Implementation notes**

- Only after items 1–2. Do not mix vault expense collections into SMS detection without an explicit product rule.
- `Expense.budgetGroupId` / spaces assignment is the likely link, not a second subscriptions collection.

**Done when:** Accepting rent can attach to an existing space without creating duplicate personal+space rows unless the user asks for both.

---

## Explicitly out of scope (unless the user asks)

- New workspace (nutrition is enough of a split).
- Full AI financial coach / replacing Insights Q&A.
- First-class `weekly` enum (use every 7 days).
- Auto-posting a second expense for `source: "sms"` detected rows (double-count with SMS/manual).
- A separate `/recurring-inbox` route unless Needs review on Subscriptions becomes cramped; prefer badges first.

---

## Suggested order

| Order | Item | Effort | Depends on |
|---|---|---|---|
| 1 | Surface Needs review | S | Shipped Phase 14 |
| 2 | Skip this occurrence | S | Processor `lastProcessed*` |
| 3 | Amount jitter | M | Detector grouping |
| 4 | Upcoming calendar | S–M | `getNextRenewalDate` |
| 5 | Stats tab | S | Ledger state stub |
| 6 | Link expenses | M | Accept path + `subscriptionId` |
| 7 | Budgets vs commitments | M | Item 4 helpful |
| 8 | Card cycle list | M | `accountId` on subs |
| 9 | Yearly / quarterly | M | Frequency model |
| 10 | Spaces / family | L | Spaces + review UI |

---

## Commands

Most items: `npx expo start` hot-reload. No native rebuild.

```bash
npm test -- services/sms shared/utils/subscriptionProcessor.test.ts
```

Firestore `recurringDismissals` already allowed by recursive `users/{uid}` rules; deploy rules only if you add a tighter match. See [`docs/FIREBASE_RULES_DEPLOY.md`](../FIREBASE_RULES_DEPLOY.md).
