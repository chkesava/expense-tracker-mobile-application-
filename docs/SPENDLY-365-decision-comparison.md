# SPENDLY-365 — Alternatives, assumptions and decision comparison workspace

**Ticket:** [SPENDLY-365](https://kesavach.atlassian.net/browse/SPENDLY-365) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-365-decision-comparison`, cut from the epic branch after 364 and merged back with approval.
**Depends on:** 362 (alternatives, inputs, assumptions, snapshot), 363 (screens)
**Scope:** Spendly only. No rules or data-model changes; every field was already in the 362 model.

---

## 1. What users see

The decision detail's **Options considered** section now shows, for each option, a count of its pros and cons and of amounts entered. It also has a **Compare options** button, which opens `/decisions/compare?id=…`.

**Layout:**
* **Phones:** the options stack vertically.
* **Wide screens (720dp and up):** the options are columns that scroll horizontally, side by side.

**Each option card holds:**
* **Pros** and **Cons**: add, remove and reorder.
* **Money in and out (your inputs):** rows with a label, an amount (helper text "Your input"), cost or benefit, and one-time, monthly or yearly.
* **Calculated:** the first-year total. It shows how it was worked out, or "Not entered" when nothing was typed.
* **Other considerations:** things that matter but aren't money.
* **"You chose this":** shown only on the user's own pick.

**Below the cards:**
* **Assumptions:** editable. Once a decision is decided, a **Changed since you decided** block lists revised, added and dropped assumptions compared with the frozen snapshot.
* **Constraints:** editable.
* **Save comparison:** has an unsaved-changes guard. The screen pads for the keyboard.

## 2. Design

### 2.1 User inputs vs calculated
`shared/utils/decisionComparison.ts` only ever adds up the numbers the user typed. Every input stored is `kind: "user_input"`. The only derived figure is the first-year total, labelled **Calculated** with its basis: one-time amounts + 12 × monthly + yearly, benefits minus costs.

### 2.2 Incomplete information is not zero
Totals for a kind of amount the user never entered are `null`, shown as "Not entered", not ₹0. An option with no amounts has no total, so it can't look like the cheapest option.

### 2.3 No option is presented as correct
`compareAlternatives` returns options in the **user's order**. It has no score, rank or "best" field; a test pins its exact shape. The only marker is `chosenByYou`, which is the user's own selection.

### 2.4 Assumption changes are versioned and reflected
* **Versioned:** saving goes through `buildDecisionWrite`. It bumps the revision and writes a `decisionEvents` row naming `assumptions` (and anything else that changed).
* **Reflected:** `assumptionChangesSinceDecision` diffs the live assumptions against the snapshot frozen at decide time. The workspace shows the difference, and the snapshot itself never changes.

### 2.5 Deterministic
The arithmetic is plain sums rounded to the paisa. The same inputs always give the same outputs, and regression tests cover each case.

## 3. Files

| File | What |
|---|---|
| `shared/utils/decisionComparison.ts` (+test, 12) | Totals, comparison rows, input drafts ↔ inputs, assumption changes since deciding |
| `components/decisions/AlternativeWorkspaceCard.tsx` | One option: pros, cons, inputs, calculated total, other considerations |
| `app/(app)/decisions/compare.tsx` | The workspace |
| `app/(app)/decisions/[id].tsx`, `app/(app)/_layout.tsx` | Entry button and route |

## 4. Validation

* `npm test`: 296 files / 4658 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Open a decision with two or more options, then tap **Compare options**.
2. Under one option, add Price ₹60,000 (Cost, One-time) and EMI ₹2,500 (Cost, Monthly). The calculated total should read −₹90,000 first year, with its explanation.
3. Leave another option empty. It should say "Not entered", not ₹0.
4. Add pros and cons, and something under Other considerations. Save, and check that the detail shows the counts.
5. On a decision you have already marked decided, change an assumption and save. The **Changed since you decided** block should show both the old and the new wording.
6. Rotate to a tablet width, or use the web build. The options should sit in side-by-side columns.
