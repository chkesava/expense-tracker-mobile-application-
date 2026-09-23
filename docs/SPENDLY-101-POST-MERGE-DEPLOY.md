# SPENDLY-101 — post-merge deploy runbook

**Status: nothing in this runbook has been run.**

Merging `credit-cards-v2` into `main` does **not** deploy the web app or an
Android APK. CI only tests. This epic is **client-only** — there are **no**
`firestore.rules`, `firestore.indexes.json`, Storage, Cloud Functions, or
Supabase changes in the integration diff — so the leftovers are app shipping
and smoke, not a backend cutover.

**Time:** about 20–30 minutes once Actions finish, plus APK install time.  
**Ticket:** [SPENDLY-101](https://kesavach.atlassian.net/browse/SPENDLY-101).  
**Integration branch:** `credit-cards-v2`.

General leftover reference: [`AFTER_MERGE_CHECKLIST.md`](./AFTER_MERGE_CHECKLIST.md).

---

## Contents

1. [What this epic ships](#1-what-this-epic-ships)
2. [What does *not* need deploying](#2-what-does-not-need-deploying)
3. [Before you start](#3-before-you-start)
4. [Step 1 — Merge to main (manual)](#step-1--merge-to-main-manual)
5. [Step 2 — Deploy web (Netlify)](#step-2--deploy-web-netlify)
6. [Step 3 — Release Expense Android](#step-3--release-expense-android)
7. [Step 4 — Smoke the credit-card surfaces](#step-4--smoke-the-credit-card-surfaces)
8. [Step 5 — Close Jira](#step-5--close-jira)
9. [Troubleshooting](#troubleshooting)
10. [Rollback](#rollback)

---

## 1. What this epic ships

| Group | Tickets | Integration PRs into `credit-cards-v2` |
|---|---|---|
| Foundations (already on `main`) | SPENDLY-95, 97, 99 | shipped earlier |
| Settled discrepancy | SPENDLY-100 | #166 |
| Health workspace | SPENDLY-103 | #168 |
| Billing-cycle / unbilled rules | SPENDLY-105 | #171 |
| Cashback & rewards | SPENDLY-107 | #172 |
| SMS matching audit | SPENDLY-108 | #175 |
| Analytics & lifecycle | SPENDLY-104 | #176 |
| Statement import / cycle CSV | SPENDLY-106 | #177 |

User-visible themes:

- Credit-card health / utilization workspace and analytics trends
- Billing-cycle and statement intelligence (period, history, unbilled warning)
- Cashback / rewards history
- Hardened SMS match audit + force-review path
- Statement import fingerprints and cycle CSV export
- Read-only settled-statement discrepancy report

---

## 2. What does *not* need deploying

Skip these for SPENDLY-101 unless a *different* open PR changed them on `main`:

- [ ] Firestore rules workflow — **not required** for this epic
- [ ] Firestore indexes — **not required**
- [ ] Storage rules — **not required**
- [ ] Cloud Functions — **not required**
- [ ] Supabase / Edge Functions — **not required**
- [ ] Nutrition or Ganesh Android releases — **not required** unless you want parity builds

---

## 3. Before you start

- [ ] Permission to run GitHub Actions `workflow_dispatch` on this repo
- [ ] Ability to merge the integration PR yourself (no auto-merge)
- [ ] A credit-card account with at least one cycle of spend for smoke
- [ ] Optional: Android tester device / App Distribution inbox for the new APK

Firebase project remains **`expenseapp-27f94`** (shared; no staging).

---

## Step 1 — Merge to main (manual)

1. Open the `credit-cards-v2` → `main` pull request.
2. Review the diff and CI yourself.
3. Merge **manually** when you are satisfied. Do not rely on auto-merge.
4. Confirm `main` tip includes the merge commit.

Until this step succeeds, leave every SPENDLY-101 child ticket **out of Done**.

---

## Step 2 — Deploy web (Netlify)

Merges do **not** publish the web app.

1. GitHub → **Actions** → **Deploy Web (Netlify)** → **Run workflow**
2. Branch: `main`
3. Wait for green.
4. Open the live Expense web URL and sign in.

If nutrition-ai is in that workflow’s env story, `GEMINI_API_KEY` must still be on the Netlify site (see `AFTER_MERGE_CHECKLIST.md`). This epic does not change that path.

---

## Step 3 — Release Expense Android

Native users stay on the previous APK until you ship a release.

1. GitHub → **Actions** → **Release — Expense** → **Run workflow** on `main`
2. Wait for: signed APK → GitHub Release → App Distribution email →
   `system_settings/latest_release_*` so the in-app update prompt can fire
3. Install / update on a tester device before treating the epic as live for APK users

You do **not** need to run Nutrition or Ganesh release workflows for SPENDLY-101 alone.

---

## Step 4 — Smoke the credit-card surfaces

On **web first**, then the **new APK**:

### Account detail (credit card)

- [ ] Health / utilization section renders without inventing balances when data is incomplete
- [ ] Analytics / lifecycle section respects `expensesComplete` (no authoritative charts on a truncated ledger)
- [ ] Unbilled-spend warning appears only when spend exceeds the threshold
- [ ] Statement card opens the open bill; empty state still allows manual add
- [ ] Past billing cycles list opens a cycle / bill detail
- [ ] Cashback history (if any) matches recorded cashback payments

### Bill detail & discrepancy

- [ ] Billing period, due date, statement amount, paid / remaining, status are visible
- [ ] Recalculate / preview path still matches full-history math for auto bills
- [ ] Settled discrepancy report route loads and stays read-only

### Import / export / SMS

- [ ] Cycle CSV export shares or downloads without crashing
- [ ] Statement import fingerprint path rejects an obvious duplicate when you re-import the same file
- [ ] SMS inbox still offers review; force-review / audit fields survive an edit where applicable

### Regression

- [ ] Paying a credit bill still updates remaining correctly
- [ ] Recording cashback still does not create a fake “user payment”
- [ ] Ganesh and Nutrition shells still open (shared shell smoke only)

---

## Step 5 — Close Jira

Only after Step 1 merge is on `main` **and** Steps 2–4 are done (or consciously deferred with a leftover comment):

1. Comment each child ticket with the integration PR / merge commit link and paste the leftover checklist below.
2. Move children → **Done**: SPENDLY-100, 103, 104, 105, 106, 107, 108 (95 / 97 / 99 already Done).
3. Move epic **SPENDLY-101** → **Done**.
4. Do **not** start SPENDLY-102 work from this runbook; that epic stays gated until explicitly requested.

### Copy-paste leftover for Jira

```
Leftovers (see docs/SPENDLY-101-POST-MERGE-DEPLOY.md):

- [ ] Merged credit-cards-v2 → main (manual review; no auto-merge)
- [ ] GitHub → Actions → Deploy Web (Netlify) → Run workflow on main
- [ ] GitHub → Actions → Release — Expense → Run workflow on main
- [ ] Smoke: credit-card account detail (health, analytics, unbilled warning, cycles, cashback)
- [ ] Smoke: bill detail + discrepancy report (read-only)
- [ ] Smoke: cycle CSV export + statement import duplicate fingerprint
- [ ] Smoke: SMS inbox review / audit path
- [ ] No Firestore rules / indexes / Storage / Functions deploy required for SPENDLY-101
```

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Web still looks like pre-epic | Netlify workflow not run, or cached old bundle | Re-run Deploy Web on `main`; hard-refresh |
| APK missing new screens | Release — Expense not run, or old APK installed | Run release workflow; install from App Distribution / in-app update |
| Analytics empty / suppressed | `expensesComplete` false (honest empty) | Wait for full expense sync; do not treat as a deploy miss |
| Import says duplicate | Fingerprint working as designed | Expected for re-import of the same statement file |
| Permission-denied on a write | Unrelated rules change on `main`, not this epic | Diff `firestore.rules` on `main` vs last known good; this epic did not change rules |

---

## Rollback

If `main` must be reverted after merge:

1. Revert the integration merge commit on `main` (or ship a follow-up revert PR).
2. Re-run **Deploy Web** on the reverted `main`.
3. Cut a new **Release — Expense** so APK users leave the bad build.
4. Leave Jira children in **In Progress** (or reopen) until a good build is live again.

There is no rules / Supabase rollback for SPENDLY-101 — nothing backend was deployed for this epic.
