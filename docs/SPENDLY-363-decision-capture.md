# SPENDLY-363 — Decision capture and editing experience

**Ticket:** [SPENDLY-363](https://kesavach.atlassian.net/browse/SPENDLY-363) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-363-decision-capture`, cut from the epic branch after 362.
**Depends on:** 362 (model, builder, rules)
**Scope:** Spendly only. No rules or data-model changes.

---

## 1. What users see

* **Entry points:**
  * a **Money Decisions** card on Insights → Analytics;
  * a **Decision** action in the global + sheet ("Note a money decision and why you made it"), which opens a new decision directly.
* **`/decisions`** lists decisions with drafts first, then open ones, then closed, then archived. It has a + button, an empty state that explains the feature, a loading skeleton, an error with retry, and an offline banner. Tapping a draft resumes it in the editor.
* **`/decisions/edit`** (or `?id=` to edit) is a five-step flow with a progress bar:
  1. **The decision:** the question, which is the only required field, and a category.
  2. **Context:** situation, goal, constraints, and assumptions. Assumptions are labelled "your assumptions, not facts from Spendly".
  3. **Options:** add, remove and reorder options (up/down buttons), each with a name and notes. Listing options is optional.
  4. **Your choice:** which option ("Not decided yet" is allowed), why, and how sure you are (1–5).
  5. **Expected & review:**
     * the expected outcome, with an amount labelled "Your estimate" and a by-date;
     * a review date, with quick picks (1, 3, 6 or 12 months);
     * linked transactions and accounts.
* **Save draft / Save** works from any step. On the last step, **Save & mark decided** freezes the reasoning (362).
* **`/decisions/[id]`** shows the question, status, category, dates, context, assumptions, the options (your choice is ticked and labelled), why, the expected outcome (labelled "your expectation at the time"), linked records (captured label and link date), and a note once the reasoning snapshot exists. Beneath that are the lifecycle actions the current state allows, plus archive/restore and delete (after a confirmation).

## 2. Design

### 2.1 Drafts live in Firestore
A new decision gets its document id before the first save. Saving a draft writes the decision and its audit event in one outbox batch, so drafts resume on any device and work offline. There is no AsyncStorage draft.

### 2.2 Minimal required fields, validated per step
`decisionStepIssues` only blocks on:
* a missing or over-long question;
* an unnamed option (the message says "name it or remove it");
* a malformed amount or date;
* a pick that was since removed.

**Next** validates the current step. **Save** jumps to the first step with a problem. Messages appear inline under the field.

### 2.3 The form never drops data
`formToDecision` applies only what the form edits. Fields owned by later stories are carried over untouched: pros, cons, cost inputs, linked and derived assumptions, commitments, outcome and snapshot. The frozen snapshot can't be changed from here (362's builder and rules pin it).

### 2.4 Links are references
`shared/utils/decisionLinks.ts` provides the picker's search across non-deleted expenses and incomes, newest first. It builds references `{kind, refId, refKind}`, with a captured label (digits masked to the last four) and the amount at the time. Linking the same record twice is deduplicated. Removing a link only drops the reference. The picker warns while older history is still loading.

SPENDLY-366 extends this with more record types and live resolution.

### 2.5 Keyboard, safe areas, back
* **Keyboard:** Android runs edge-to-edge, so the editor adds the keyboard height to the scroll padding. `useKeyboardHeight` moved from `common/Modal` into `hooks/` so both can use it; Modal's behaviour is unchanged.
* **Bottom inset:** comes from `usePageListBottomPadding`.
* **Unsaved changes:** the header back button, Android back and the iOS swipe all go through `useUnsavedChangesGuard`, which asks before discarding.
* **Routes:** `/decisions` and `/decisions/…` pop on Android back and are restorable. Both have tests.

## 3. Files

| File | What |
|---|---|
| `shared/utils/decisionForm.ts` (+test, 12) | Steps, form ↔ decision, per-step validation, reorder, review-date choices, dirty check |
| `shared/utils/decisionLinks.ts` (+test, 7) | Link builders, masking, dedupe, removal, transaction search |
| `shared/utils/decisionModel.ts` (+test) | `sortDecisionsForList` |
| `services/decisions/decisionStore.ts` | Save and delete, each as one atomic outbox batch with its audit event |
| `hooks/useDecisions.ts`, `hooks/useKeyboardHeight.ts` | Listener (decision screens only), keyboard height |
| `app/(app)/decisions/index.tsx`, `[id].tsx`, `edit.tsx` | List, detail, editor |
| `components/decisions/*` | Status badge, row, list editor, link picker, Insights card |
| `app/(app)/_layout.tsx`, `insights.tsx`, `components/AddActionSheet.tsx`, `shared/config/addActions.ts`, `navigation.ts`, `routeRestoration.ts` (+tests) | Routes and entry points |
| `components/common/Modal.tsx` | Imports the extracted keyboard hook (no behaviour change) |

## 4. Validation

* `npm test`: 294 files / 4636 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. On Spendly Test (emulator), tap + → **Decision**. Type a question, tap Next, and try leaving with the back button. You should be asked before your entry is discarded.
2. Save a draft on step 2 and go back to the list. The draft should be first; tapping it resumes where you left off.
3. On Options, add three options, reorder them, and remove one. Leave one unnamed and press Next: the message should appear.
4. Pick an option, then on the last step link a transaction and an account and choose "In 3 months".
5. Tap **Save & mark decided**. The detail should show "Your choice", the linked records, and the reasoning-saved note.
6. Edit the title and check the detail still says the reasoning was saved on the original date.
7. Turn on airplane mode and save a change. The toast should say it was saved offline.
8. Archive the decision, restore it, then delete it. The linked transaction should still be in the ledger.
