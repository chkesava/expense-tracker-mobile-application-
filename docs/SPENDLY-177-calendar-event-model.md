# SPENDLY-177: Financial Calendar event model and source mapping

**Ticket:** [SPENDLY-177](https://kesavach.atlassian.net/browse/SPENDLY-177) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-177-calendar-event-model`, cut from the epic branch.
**Scope:** pure contract and adapters. There is no UI, no Firestore and no rules change.

---

## 1. Event schema (`shared/types/calendar.ts`)
| Field | Meaning |
|---|---|
| `id` | Stable `${source}:${refId}:${date}`: one event per record per date, the same on every refresh |
| `source` | `card_bill`, `subscription`, `emi`, `borrowing`, `receivable`, `income`, `goal`, `investment`, `sip`, `epf`, `reminder` (183) |
| `refId` | The canonical record id, kept so the event can always deep-link back |
| `date`, `time?` | Local date key in `settings.timezone`; optional `HH:mm` (reminders) |
| `title`, `subtitle?` | Display text |
| `amount`, `currency` | `null` when the source has no reliable amount. Currency comes from the record, or the display currency |
| `direction` | `in`, `out` or `neutral` |
| `state` | See §2 |
| `priority` | 3 overdue · 2 due within 3 days · 1 open · 0 informational |
| `actionable` | Whether there is something to do (pay, collect, fund) |
| `href` | In-app route to the source |
| `recurrenceId?` | Shared by every occurrence of one recurring item |

**Timezone:** every date is a local date key computed by the caller with `todayDateKey(settings.timezone)`. Adapters take `today` and the range as input and never read the clock.

## 2. States
| State | Meaning | Used for |
|---|---|---|
| actual | Happened and recorded | Recorded income, credited EPF |
| scheduled | A commitment with a known date | Open card bill, renewal, EMI, SIP run, loan due date, goal deadline |
| expected | Dated but not certain | Money owed to you, FD maturity, EPF credit window |
| projected | Derived by Spendly | Reserved for forecasts (182); source adapters never produce it |
| overdue | Date has passed while still open | Unpaid bill, uncollected receivable, missed EPF credit, unexecuted SIP run |
| completed | Settled or paid | Paid bill, settled loan or receivable, reached goal, matured FD |
| cancelled | Cancelled or skipped | Cancelled bill or receivable, skipped next SIP run |

## 3. Mapping rules (`shared/utils/calendarSources.ts`)
| Source | Date | Amount | Direction | Link |
|---|---|---|---|---|
| Card bill | `dueDate` | Remaining if open, statement if paid | out | `/credit-card-bills/{id}` |
| Subscription / EMI | Future renewals from `getNextRenewalDate`, expanded with the shared schedule helper (`occurrencesBetween`); EMIs stop at their end month | Item amount | out | `/ledger?tab=subscriptions` |
| Borrowing | `dueDate` only | `totalOutstanding` (none once settled) | out | `/ledger?tab=borrowings&id=` |
| Receivable | `dueDate` only | `outstandingAmount` while open | in | `/ledger?tab=receivables&id=` |
| Income | Recorded `date` only | Recorded amount | in | `/transactions/{id}?kind=income` |
| Goal | `deadline` only | **None:** a milestone, not cash | neutral | `/settings/money` |
| Investment (FD) | `maturityDate`; closed deposits excluded | Estimated maturity value | in | `/investments?tab=investments&id=` |
| SIP | From `nextExecutionDate` by frequency (daily, weekly, monthly, quarterly, yearly), up to `endDate`; paused or cancelled plans excluded | Instalment | out | `/investments?tab=sip` |
| EPF | `creditDate` once credited, else end of `expectedCreditTo`; drafts and reversals excluded | `epfCredit` | **neutral:** it credits EPF, not bank cash | `/epf/{establishmentId}` |

**Deliberately not shown:**
- **Past renewals:** they were posted as expenses already, and the calendar never re-shows a posted expense as a second commitment.
- **Recurring transfers:** money moving between the user's own accounts.
- **Items without a date:** loans and receivables with no due date, goals without a deadline, EPF without a window.
- **Expected salary:** Spendly has no scheduled-income record, so nothing is invented.

**Calendar-only reminders** (`source: "reminder"`, 183) are separate, non-ledger events.

The `?id=` links for borrowings, receivables and investments start working in 181, which opens the existing detail modals. Until then the tab opens.

**Shared code:** quarterly and yearly SIPs needed an `intervalMonths` option on the runway schedule helper (`runwayEngine.ts`). Runway's behaviour is unchanged and tests cover it.

## 4. Acceptance criteria
| Criterion | Where |
|---|---|
| A documented event schema exists | §1, `shared/types/calendar.ts` |
| Every supported source has explicit mapping rules | §3 and one adapter per source |
| Actual vs scheduled vs projected semantics are documented | §2 |
| Source record ids are retained for deep links | `refId` and `href` on every event; tests |
| Calendar-only reminders are kept separate | `reminder` source, reserved for 183 |

**Tests** (`calendarSources.test.ts`, 15): stable ids, priority, every adapter's states, past ranges, end months, SIP frequencies and skips, the no-invented-money rules, and leap-February range edges.
