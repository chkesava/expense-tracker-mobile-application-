# SPENDLY-366 — Financial context and linked-record intelligence

**Ticket:** [SPENDLY-366](https://kesavach.atlassian.net/browse/SPENDLY-366) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-366-decision-linked-records`, cut from the epic branch after 365.
**Depends on:** 362 (link model), 363 (picker and screens)
**Scope:** Spendly only. No rules or data-model changes: every link kind was already in the 362 enum.

---

## 1. What users see

* **Link picker:** has five tabs.
  * **Transactions:** expenses, incomes, card bill payments, cashback, transfers.
  * **Accounts & cards.**
  * **Loans & lent:** borrowings and receivables.
  * **Goals.**
  * **Recurring:** subscriptions, EMIs and auto-transfers.

  Each row says what the record is in money terms, for example "Transfer between your accounts — not spending" or "Refund — not new income".
* **Decision detail → Linked records:** shows each record **as it is now**, read-only:
  * its current label and what it is;
  * its current amount, marked "for reference — not counted in this decision";
  * "(was ₹X when linked)" if the amount has changed since linking;
  * when it was linked.

  Tapping a record opens it in its own module: the transaction, the account, or the loans / money-lent / recurring tab.
* **Remove link:** asks for confirmation first ("stays in Spendly exactly as it is"). Only the reference is removed.
* **Honest states:** a record can show as *Loading…*, *no longer exists*, *was deleted* (soft-deleted expenses and incomes, voided payments) or *couldn't read this right now*. The captured label stays visible, so the reasoning still reads correctly.
* **"Log a decision about this":** on an account's overview and on a transaction's detail (expense, income, payment or transfer). It opens a new decision already linked to that record.

## 2. Design

### 2.1 References, never a second source of truth
A link stores only `{kind, refId, refKind?}` plus what it looked like when linked (`captured*`). `resolveDecisionLink` reads the live record from the providers that already hold it: `FinanceDataProvider`, `BorrowingsReceivablesProvider`, and the goals and subscriptions reference data. It has **no new listeners** and never writes. Nothing sums a link's amount, and a test confirms the comparison totals ignore links entirely.

### 2.2 Non-spend movements
`LinkNature` classifies each linked transaction:

| Record | Nature |
|---|---|
| Expense | spend |
| Income, source or note says refund/reversal | refund |
| Income, source or note says cashback | cashback |
| Other income | income |
| Account payment with `sourceType: "cashback"` | cashback |
| Other account payment | bill_payment |
| Account transfer | transfer |
| Account entry | adjustment |

Every non-spend nature carries a label saying what it is **not**, so it can never be read as spending or income.

### 2.3 Honest states
The two error states are kept separate:

* *Unavailable:* the source failed to load, for example permission denied.
* *Loading:* the source is still loading. For transactions this lasts until the full history has loaded, which avoids reporting an old record as missing.

A record is *deleted* if it is soft-deleted or voided, and *missing* if it isn't found at all.

### 2.4 Insurance and calendar
The app has no insurance module and no calendar yet. Insurance can be linked through the expense (for example a premium in an insurance category). Calendar links arrive with SPENDLY-176.

## 3. Files

| File | What |
|---|---|
| `shared/utils/decisionLinks.ts` | Builders for every record type, `LinkNature` + labels, `resolveDecisionLink`, `linkFromRouteParams`, movement search |
| `shared/utils/decisionLinks.resolve.test.ts` (10) | Natures, live resolution, changed-since-linked, every honest state, route params, links never in totals, removal leaves the source untouched |
| `hooks/useDecisionLinkSources.ts` | All link sources from existing providers |
| `components/decisions/DecisionLinkPicker.tsx` | Five tabs, nature labels |
| `components/decisions/LinkedRecordRow.tsx` | Read-only live row with state and remove |
| `app/(app)/decisions/[id].tsx`, `edit.tsx` | Live linked records and unlink; pre-link from route params |
| `app/(app)/accounts/[id].tsx`, `app/(app)/transactions/[id].tsx` | "Log a decision about this" |

## 4. Validation

* `npm test`: 297 files / 4668 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Open a transaction and tap **Log a decision about this**. The new decision's last step should already show that transaction linked.
2. In the picker, check each tab. A transfer should read "not spending" and a refund income "not new income".
3. Save the decision, then edit the linked expense's amount in the ledger. The decision detail should show the new amount with "(was ₹… when linked)".
4. Delete that expense. The detail should say it was deleted and still show the captured label.
5. Remove a link. The confirmation says the record stays, and the transaction is still in the ledger.
6. From an account's overview, tap **Log a decision about this account**.
