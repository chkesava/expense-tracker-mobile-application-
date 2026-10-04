# SPENDLY-364 — Decision templates and category-specific capture

**Ticket:** [SPENDLY-364](https://kesavach.atlassian.net/browse/SPENDLY-364) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-364-decision-templates`, cut from the epic branch after 363 and merged back with approval.
**Depends on:** 362 (`templateId` and `templateVersion` fields, already in the rules), 363 (the capture flow)
**Scope:** Spendly only. No rules or data-model changes.

---

## 1. What users see

The first step of a new or draft decision offers **Start from a template (optional)**. There are eight templates:

- Purchase
- Loan or debt
- Savings or goal
- Investment
- Insurance
- Subscription or recurring cost
- Salary or income
- Something else (blank)

Choosing one does the following:

* **Category:** it sets the template's category. The category chips stay available, so the user can override it.
* **Prompts:** every free-text field gets placeholder prompts written for that kind of decision. For example, a loan template asks "Which loan, and what changed?"
* **Suggestions:** constraints, assumptions and options show **Suggestions — tap to add, or skip** chips. Nothing is added unless the user taps it, and a suggestion already in the list disappears.
* **Links:** the link picker opens on the list the template usually needs: transactions for a purchase, accounts for a loan.

The decision detail says "Started from the … template". Once a decision has been decided, the template can't be changed; the editor just names it.

## 2. Design

### 2.1 Prompts, never answers
A template supplies placeholders, suggestions and a default category. It never fills in an answer, never adds a required field, and never reads or writes a financial record. `applyDecisionTemplate` changes only the template, its version and the category. A test checks that the typed answers and all lists stay unchanged.

### 2.2 Versioned
`shared/data/decisionTemplates.ts` keeps **every published version** of every template, and the list only ever grows. `DECISION_TEMPLATES` is the latest version of each. A decision stores `templateId` and `templateVersion`, and the editor asks `getDecisionTemplate(id, version)` for **that exact version**. When v2 of a template ships, decisions made under v1 keep v1's prompts.

An unknown id, or a missing version, falls back to the latest version of that template, then to the blank template, so the screen never breaks. The rule is: never edit a published version; add `version + 1`.

### 2.3 No advice
Suggestions describe common situations, such as "Keep 3–6 months of expenses aside" or "Prepay part of it". A test checks that no template text recommends anything, calls anything "best", or promises a result.

### 2.4 Contextual links
`linkHint` chooses which list the link picker opens first. SPENDLY-366 adds loans, goals and subscriptions as link types, and the "Log a decision about this" entry from a record.

## 3. Files

| File | What |
|---|---|
| `shared/data/decisionTemplates.ts` (+test, 6) | Versioned registry, latest set, exact-version lookup with fallback |
| `shared/utils/decisionForm.ts` (+test, 4 new) | Template fields on the form, `applyDecisionTemplate`, tap-to-add suggestion helpers |
| `app/(app)/decisions/edit.tsx` | Template picker, per-template prompts, suggestion chips, link-picker hint |
| `app/(app)/decisions/[id].tsx` | "Started from the … template" |
| `components/decisions/DecisionLinkPicker.tsx` | `initialTab` |

## 4. Validation

* `npm test`: 295 files / 4646 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Tap + → **Decision** and choose **Loan or debt**. The category becomes Loan or debt, and the placeholders change.
2. On Context, tap one suggested constraint. It is added and its chip disappears. Skip the rest.
3. On Options, tap "Prepay part of it" and "Keep paying as scheduled", then rename one.
4. On the last step, open **Link a transaction or account**. It should open on Accounts.
5. Save and mark decided. The detail says "Started from the Loan or debt template". Editing again shows the template name, but no picker.
