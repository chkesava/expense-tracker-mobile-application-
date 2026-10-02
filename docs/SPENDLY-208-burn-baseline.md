# SPENDLY-208: Historical burn-rate analysis and baseline selection

**Ticket:** [SPENDLY-208](https://kesavach.atlassian.net/browse/SPENDLY-208) (Story)
**Epic:** [SPENDLY-204](https://kesavach.atlassian.net/browse/SPENDLY-204). See the [epic record](SPENDLY-204-financial-runway.md).
**Branch:** `feature/SPENDLY-208-burn-baseline`, cut from the epic branch after 206.
**Depends on:** 205 (classes) and 206 (engine). **Scope:** pure logic only. There is no UI, no Firestore and no rules change. The window, method and month table are shown in the 210 UI.

---

## 1. What it does
`buildRunwayBaseline({ expenses, incomes, subscriptions, today, windowMonths, method, includeUnusual? })` in `shared/utils/runwayBaseline.ts` turns recorded transactions into the monthly `RunwayBaseline` the 206 engine needs.

It returns:
- **window:** months, from, to and method. This is visible to the user;
- **currentMonth:** the partial month's actual figures so far. They are reported, never averaged;
- **months:** one row per window month, with its status, earned income, refunds, outflow per burn class, the recurring part, unusual items excluded, and the transaction count;
- **monthsOfHistory;**
- **burnBaseline** and **projectionBaseline** (see §4);
- **unusual:** the list of excluded one-offs;
- **reconciliation;**
- **assumptions:** 205 codes for confidence.

## 2. Window and methodology
- **Window:** the last N **complete** calendar months before the current month, where N is 3, 6 or 12 (capped at 24). Leaving out the current partial month means a half-finished month can't drag the average down.
- **Average:** the sum over included months divided by the number of included months.
- **Median:** the middle included month, or the mean of the middle two. It's less affected by one heavy month.
- **Rounding:** each figure is rounded to 2 decimals.

## 3. Missing and partial months
| Status | Meaning | In the average? |
|---|---|---|
| `included` | Has at least one transaction | Yes |
| `before_history` | Before the user's first recorded transaction | No: listed only |
| `empty` | After the first record, but with no transactions | No: listed only, since it's more likely a gap in records than a month with zero spending |

`monthsOfHistory` counts only included months, and it drives the 205 confidence grade:
- 0 months: **no baseline** (`null`, so the engine says `insufficient_data`) and `no_history`;
- under 3 months: `short_history`.

## 4. Classification and double counting
- **Expenses** use the 205 burn classes. Money movement (Credit Card Payment, Transfer) is never burn; it's reconciled separately. Deleted rows and non-positive amounts are ignored.
- **Income:**
  - earned income is income;
  - refunds, cashback and reimbursements reduce **discretionary** spending for that month, never below zero;
  - investment proceeds are ignored and reported in `ignoredIncome`.
- **Two baselines:**
  - **`burnBaseline`** includes everything. Use it for net burn and gross burn.
  - **`projectionBaseline`** leaves out expenses that were posted by a recurring item **that is still active** (matched by `subscriptionId`), because the commitment-aware projection adds those items as scheduled events (206).
  - Expenses from paused or completed items stay in both, since they are history, not future commitments.
- **Known limit:** recurring items detected from SMS (`source: "sms"`) may match expenses that carry no `subscriptionId`. When any active SMS-detected item exists, `uncertain_commitments` is raised, which lowers confidence to medium.

## 5. Unusual one-time expenses
- **Rule:** a single expense larger than **2 × the window's median monthly outflow** is *unusual*. Examples are a laptop or a deposit.
- **Default treatment:** it's **listed and left out** of the baseline, so one purchase doesn't shorten every future month.
- **Keeping it:** `includeUnusual: true` keeps it in. It stays listed either way.
- **When the rule applies:** only with at least two months of history, so "unusual" has something to compare against.

## 6. Reconciliation
Over the window: `expenseTotal = countedOutflow + moneyMovement + unusualExcluded` (tested). Earned income, refunds and ignored income are each totalled. Every figure comes from active source rows.

## 7. Acceptance criteria → tests (`runwayBaseline.test.ts`, 13)
| Criterion | Where |
|---|---|
| Historical window is visible | `window` in the output (shown by the 210 UI); "uses the last N complete months…" |
| Actual vs projected kept apart | The baseline is an estimate built from actual months. The current month is reported separately as actual; projected values only appear in the engine output |
| Average and median documented | §2; "supports average and median" |
| Partial months don't distort results | The current month is excluded; same test |
| Missing months are handled explicitly | §3; "excludes months before the first record and flags empty months", plus the no-baseline test |
| One-time unusual expenses | §5; the list, exclude and keep tests |
| Burn figures reconcile to source transactions | §6; "accounts for every source rupee" |
| Large histories stay fast | 50,000 transactions over 12 months, well within budget (single pass) |

There's also an end-to-end check that the baseline feeds `runRunwayEngine` correctly.
