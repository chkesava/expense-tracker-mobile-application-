# SPENDLY-206: Financial Runway calculation and projection engine

**Ticket:** [SPENDLY-206](https://kesavach.atlassian.net/browse/SPENDLY-206) (Story)
**Epic:** [SPENDLY-204](https://kesavach.atlassian.net/browse/SPENDLY-204). See the [epic record](SPENDLY-204-financial-runway.md).
**Branch:** `feature/SPENDLY-206-runway-engine`, cut from the epic branch after 207 and merged back with approval.
**Depends on:** 205 (contract) and 207 (liquid total). **Scope:** pure logic only. There is no UI, no Firestore and no rules change.

---

## 1. What it does
`runRunwayEngine(input)` in `shared/utils/runwayEngine.ts` takes:

| Input | Comes from |
|---|---|
| `today` | A local date key in `settings.timezone`. The engine never reads the clock |
| `liquid` | The counted total from Runway sources (207) |
| `baseline` | Typical monthly earned income and outflow per burn class. **208** will derive it from history, with known commitments removed so nothing is counted twice |
| `events` | Dated inflows and outflows: recurring items and card bills now (`runwayEvents.ts`), Financial Calendar events later (209) |
| `mode`, `threshold`, `projectionMonths` | The 205 contract |

It returns:
- **result:** the mode, state, months, floor and monthly burn;
- **thresholdDate;**
- **liquid** and **essentialMonthly;**
- **expectedInflow** and **expectedOutflow** over the horizon;
- **minimumBalance**, with its date;
- **periods:** for each month, the opening balance, inflow, outflow, net surplus or deficit, closing balance and a below-floor flag;
- **drivers:** the top 6 contributors, with their share;
- **horizonEnd;**
- **issues.**

## 2. Modes
| Mode | Calculation | Threshold date |
|---|---|---|
| Net burn | 205 `netBurnRunway` on the baseline: outflow in the classes net mode counts, minus earned income | today + months × 30.4375 days |
| Gross (essential) burn | 205 `grossBurnRunway` on the essential, debt-service and fee classes. Income is ignored | today + months × 30.4375 days |
| Commitment-aware projection | Day-by-day simulation of baseline plus events | First day the closing balance is below the floor |

**Periods for every mode:** each mode also returns month periods, using the flows that mode counts. Gross mode uses no income and only essential-class events. Money movement never counts.

**Projection results:**
- If the balance is still above the floor at the horizon but has fallen, the state is the new **`beyond_horizon`**: it lasts at least the whole horizon.
- If the balance hasn't fallen, the state is **`not_depleting`**.

**Without a baseline the result is `insufficient_data` in every mode.** A projection built only from known commitments would leave out everyday spending and badly overstate runway.

## 3. Determinism and dates
- **Same input, same output:** no clock, no random values, and the input is never mutated (tested).
- **The horizon:**
  - it covers `projectionMonths` calendar months, counting the current partial month, and ends on the last day of the final month;
  - day 1 is `today`;
  - the liquid total is the balance as of today, before any events due today.
- **One-time events** are applied once. Overdue ones land on today, and events after the horizon are ignored.
- **Monthly events:**
  - the first occurrence is the item's next renewal date (`getNextRenewalDate`, which honours `lastProcessed` and `startMonth`);
  - after that it's `dayOfMonth`, clamped to short months (31 → 30 → 28/29);
  - they stop after their end month.
- **Every-N-days events** step from their first date, catch up past dates arithmetically, and cross 29 February correctly.

## 4. Rounding
- Money is plain rupees, rounded to **2 decimals** with `roundMoney` after every daily step.
- The baseline is spread as a rounded daily share, and **the month's last day takes the remainder**, so a full month totals exactly the monthly figure. A partial first month gets remaining days × daily share.
- Runway months are rounded to **1 decimal**. Converting between days and months uses **30.4375** days per month (365.25 ÷ 12).

## 5. Existing commitments → events (`runwayEvents.ts`)
| Source | Event |
|---|---|
| Active subscriptions | Monthly or every-N-days outflow. The burn class comes from the category (205) |
| Active EMIs | Same, classed as debt service; stops at the end month |
| Unpaid card bills (open statuses, remaining > 0, display currency) | One-time outflow on the due date |
| Recurring transfers | **Excluded:** money moving between the user's own accounts |
| Loans with only a due date | **Excluded:** there's no instalment schedule, and the EMI is usually already a recurring item, so counting both would double count |
| Money owed to the user | **Excluded** (205: not cash until received) |

Financial Calendar events are **not** built here. SPENDLY-209 will feed them in as further `RunwayEvent`s once SPENDLY-176 defines its contract.

## 6. Acceptance criteria → tests (`runwayEngine.test.ts`, 22)
| Criterion | Test |
|---|---|
| Same inputs, same results | "gives identical output…", "does not mutate its input" |
| Projection dates are deterministic | The crossing-day and threshold-date tests |
| Zero, positive and negative burn | "handles zero, negative and positive burn" |
| One-time events are applied once | "applies a one-time event exactly once", the overdue and after-horizon test |
| Recurring events use the correct cadence | Monthly clamp, end month, every-N-days catch-up |
| Threshold crossing is correct | Zero floor, amount floor, essential-months floor, already below |
| Currency rounding is documented | §4 and the exact month-total test |
| Month boundaries and leap years | 29 Feb clamp, leap-day interval, leap February proration |
| No Firebase records are mutated | Pure module with no Firebase import; the input-unchanged test |

Performance: 24 months with 300 recurring events runs well under 500 ms.

## 7. Files
| File | What |
|---|---|
| `shared/utils/runwayEngine.ts` | The engine |
| `shared/utils/runwayEvents.ts` | Recurring-item and card-bill adapters |
| `shared/utils/runwayEngine.test.ts` | 22 tests |
| `shared/types/runway.ts` | The `beyond_horizon` state |
