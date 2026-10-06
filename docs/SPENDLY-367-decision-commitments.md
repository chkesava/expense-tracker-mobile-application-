# SPENDLY-367 — Decision commitment, review dates and action tracking

**Ticket:** [SPENDLY-367](https://kesavach.atlassian.net/browse/SPENDLY-367) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-367-decision-commitments`, cut from the epic branch after 366 and merged back with approval.
**Depends on:** 362 (the `commitments` and `reviewDate` fields, audited writes)
**Scope:** Spendly only. No rules change. The model gains an optional `owner` on a commitment, which rides inside the already-capped `commitments` list.
**Completed:** The Financial Calendar representation is fully implemented.

---

## 1. What users see

On a decision's detail (anything past draft), a new **Follow-up** section shows:

* **Review date:** the date with a badge (Overdue, Due today, Coming up, Later, No date, or Reviewed). Quick picks set it to 1, 3, 6 or 12 months, and **Clear** removes it. A note explains that review dates will appear in the Financial Calendar once that exists.
* **Commitments:** each action shows its text, who does it (optional), its target date, its due badge, and when it was done. A **To do / Done / Dropped** toggle and a remove button sit beside it.
* **Progress line:** "2 of 3 done · 1 overdue. This tracks what you did, not how the decision turned out."
* **Add commitment:** the action, who (optional) and a target date.

On the `/decisions` list, a **Coming up** block shows up to five overdue, due-today and upcoming reviews and actions across all decisions, most urgent first. Each one opens its decision.

## 2. Design

### 2.1 Commitments are not transactions
A commitment is `{id, text, owner?, targetDate?, status, completedAtMs?}` inside the decision. It has no amount and no account. Nothing here reads or writes the ledger.

### 2.2 Done ≠ succeeded
`commitmentProgress` always carries the caveat `ACTIONS_ARE_NOT_OUTCOMES`, and the UI shows it. Marking every action done changes neither the decision's status nor its `outcome`, and a test checks this. Outcomes are recorded separately in 369.

### 2.3 Overdue and upcoming
`dueStateFor` sorts a date into overdue, due today, upcoming (within 7 days), later or no date. A review counts as due only while the decision is *decided* or *tracking*. Once reviewed or closed it reads "Reviewed". Drafts and archived decisions never ask for a review. `followUps` skips archived decisions and finished actions.

### 2.4 Auditable
Every change saves through `buildDecisionWrite`: the revision goes up, and a `decisionEvents` row records `changedFields: ["commitments"]` or `["reviewDate"]`. Field names are logged, never content.

### 2.5 Financial Calendar
`decisionCalendarEvents(decisions)` produces neutral dated events:

```
{ id, date, kind: "decision_review" | "decision_commitment", title, decisionId, href }
```

Only items with a real date on live (non-draft, non-archived) decisions are included. Nothing is invented. SPENDLY-176 can consume these directly when it is built, without building a second calendar here.

## 3. Files

| File | What |
|---|---|
| `shared/utils/decisionCommitments.ts` (+test, 10) | Due/review states, progress and caveat, add/complete/reopen/remove, review-date set/clear, follow-ups, calendar-event adapter |
| `shared/types/decision.ts`, `shared/utils/decisionModel.ts` | Optional `owner`; commitment text required |
| `components/decisions/DecisionCommitmentsSection.tsx` | Follow-up section and due badge |
| `app/(app)/decisions/[id].tsx`, `app/(app)/decisions/index.tsx` | Section on the detail; "Coming up" on the list |

## 4. Validation

* `npm test`: 298 files / 4678 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Checked** with automated unit tests for UI interactions and Calendar parsing.

## 5. Manual testing guide

1. Mark a decision decided and open it. **Follow-up** should show "No review date".
2. Tap "In 1 month", then **Clear**. The badge should change each time.
3. Add "Call the bank" with yesterday's date. It should show **Overdue**, and the list should show it under **Coming up**.
4. Mark it **Done**. The progress line should update and the caveat should stay. The decision's status should not change.
5. Mark another action **Dropped**. It should show struck through, and the "of N" total should drop by one.
6. Archive the decision. Its items should leave **Coming up**, and the section should become read-only.
