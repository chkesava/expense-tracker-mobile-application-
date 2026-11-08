# SPENDLY-288 Tax & ITR Readiness: QA, rollout and rollback (SPENDLY-299)

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md) §13).

**Status:** every story is built and merged to the epic branch `feature/SPENDLY-288-tax-itr-readiness`. Nothing tax-related is deployed. SPENDLY-711 (delete-account file purge) is the only part already on main.

Every production step below needs the owner's approval, one step at a time. There is one Firebase project for dev and prod, so each data-touching step gets a dry run or a diff first.

## 1. What was validated, and how

| Area | How | Result (2026-11-08) |
|---|---|---|
| Calculation engine (FY 2025-26) | `computeTax.test.ts`: hand-worked examples from the cited rules (rebate, marginal relief, 80C/80D caps, special rates, unused basic exemption, ₹5 lakh rebate edge, surcharge marginal relief, house property, 80TTA/80TTB, senior slabs), determinism, input hash, rule version | Pass |
| Input assembly and gaps | `taxInput.test.ts`, `estimatePresentation.test.ts` | Pass |
| TDS reconciliation | `tdsReconcile.test.ts`, `taxTdsStore.test.ts` | Pass |
| Deductions | `deductions.test.ts`, `taxDeductionStore.test.ts` | Pass |
| Capital gains | `capitalGains.test.ts` (FIFO, splits/adjustments, missing history, holding-period rules, s.50AA, VDA, statement totals), `capitalGainForms.test.ts`, `taxCapitalGainStore.test.ts` | Pass |
| Payments | `payments.test.ts` | Pass |
| Readiness and checklist | `readiness.test.ts`, `taxChecklistStore.test.ts` | Pass |
| Calendar: no duplicates | `taxCalendar.test.ts`: stable ids, one event per deadline across rebuilds, `duplicatesDropped` 0, lifecycle, notifications | Pass |
| Export | `summaryExport.test.ts`, `taxSummaryExport.test.ts` (sections apart, TAN masked, partial year, snapshot only after Firestore confirms) | Pass |
| No cross-year leakage | `taxQa.test.ts`: another year's records and decisions change nothing in this year's figures; every tax listener is bounded to a year (7 listeners checked) | Pass |
| No cross-user access (Firestore) | `firestore/tax.rules.test.ts`: owner-only reads and writes, forged entries refused | Pass: full rules suite, 34 files, 678 tests (2026-11-08) |
| No cross-user access (Supabase) | Read-model SQL suite on a throwaway Postgres 18 cluster: all 22 migrations, `assert_security`, `rls_behaviour`, `sync_functions`, `purge`, `verify`, `views`, `golden`, `push`, `client_apply`, `realtime`, `assert_security` again | Pass (perf budget not run locally; CI runs it on Postgres 17) |
| Identifiers | `taxQa.test.ts`: no PAN field in the model, rules or read model; TAN masked in lists, traces and exports | Pass |
| Decisions survive rebuilds | `taxQa.test.ts` (same state every rebuild; a corrected certificate re-opens an accepted difference), plus each store's tests | Pass |
| Document privacy and deletion | `documents.test.ts`, `taxDocumentStore.test.ts`, Edge Function `spendly-files` handler tests (ownership by `taxDocuments/{id}`), `spendlyFilesPurge.test.ts` (711) | Pass |
| Read model guards | `providerSwitch`, `listenersOff`, `readModelWriteHooks`, `mapping` (incl. "latest migration restates every synced table"), `readmodelCrossUserIndexes` | Pass |
| Existing modules | Full unit suite on the whole epic (299 branch) | Pass: 623 files, 8,582 tests (2026-11-08) |
| Types | `typecheck` and `typecheck:shared` | Pass |

**Load-dependent tests** fail only when the machine is short of memory:
- `calendarQuery` "queries a month quickly" (800 ms);
- `readmodelSyncCore`'s 5 s timeout;
- a few other timeouts.

They fail the same way without the tax changes. CI runs them on a clean runner.

### Not validated here (owner steps)

These need a device, a signed build, or a person:
- the end-to-end FY journey on Spendly Test (emulator, demo data);
- the signed-release check;
- Android performance and memory profiling;
- a screen-reader pass.

The checklist is in §4.

## 2. Post-merge checklist (in order, each with approval)

| # | Step | Detail | Done |
|---|---|---|---|
| 1 | **Epic PR to main** | Open the PR from `feature/SPENDLY-288-tax-itr-readiness`. Wait for PR Checks, Read-model schema and the rules suite; merge only when green. | ☐ |
| 2 | **Firestore indexes** | `firestore.indexes.json` gained the tax field overrides (SPENDLY-709). Diff against live first (index drift memory), then deploy. | ☐ |
| 3 | **Firestore rules** | Tax rules: 709, plus the reconciliation review (291) and the capital-gain `term` (293). Deploy **before** any release that shows the tax center. | ☐ |
| 4 | **Supabase migration `20261110000000_readmodel_tax.sql`** | Adds `tax_profiles`, `tax_entries`, `tax_reviews`, `tax_documents`, `tax_snapshots` with owner-only RLS, the `rm_client_apply` allowlist and the purge. It restates 20261108, so 20261106–08 must already be applied (they were, 2026-11-07). Apply to project `spmsgncjbnbkxvsbpqlu`, then run `supabase-readmodel/tests/assert_security.sql`. | ☐ |
| 5 | **Edge Function `spendly-files`** | `npm run supabase:deploy:spendly-files`. Tax document uploads (298) need it. | ☐ |
| 6 | **Web deploy** | Carries 711's delete-account file purge and the web app. The owner decides (Netlify credits). | ☐ |
| 7 | **Expense release** | A native build with the tax screens. Rules (3) and the migration (4) must be live first. | ☐ |
| 8 | **Flag, staged** | In `system_settings/global` (admin only), set `enableTaxCenterFor: ["<owner uid>"]`. Run the device journey (§4) on the real account. | ☐ |
| 9 | **Flag, everyone** | `enableTaxCenter: true`, only after step 8 is clean. | ☐ |
| 10 | **Jira** | Epic and stories to Done once on main (stories are In Progress / built until then). | ☐ |

## 3. Rollback

- **Turn the flag off** (`enableTaxCenter: false`, remove the uid). The tax screens redirect, and the tax calendar events, inbox items, notifications and tax listeners stop. **Stored tax data stays as it was**; nothing is deleted.
- **The Firestore rules and the Supabase tables** can stay in place. They only allow the owner to read and write their own tax records.
- **Snapshots** are append-only, and a later rule version never rewrites one.
- **A wrong rule figure:** fix it as a new rule set with a new `ruleVersion` and a test, never by editing an existing one.

## 4. Device journey (owner, Spendly Test on the emulator, then the real account behind the flag)

1. **Tax center:** the year chips, "Not started" on an empty year, the progress label, and "What Spendly doesn't cover".
2. **Your details:** set residential status and age band; the profile item clears.
3. **TDS & Form 16:** add a Form 16 and a 26AS line; check the difference and accept it; change the certificate and confirm it re-opens.
4. **Income:** confirm and leave out items; check the overlap warning.
5. **Deductions:** confirm eligibility; attach a proof from Documents.
6. **Capital gains:** confirm a portfolio sale; change its asset type; add a statement total and see Spendly's sales of that type replaced.
7. **Tax payments:** add advance tax; the calendar instalment shows done.
8. **Tax estimate:** both regimes, the workings, the assumptions; set a profile and see the result change.
9. **Calendar and inbox:** tax events appear once; turn on Tax deadlines notifications.
10. **Export:** PDF and CSV; check the TAN is masked and the sections are in order.
11. **Offline:** add a payment offline and see it sync.
12. **Accessibility:** TalkBack over the dashboard and the checklist menu.
13. **Performance:** scroll the capital-gains and income lists, and check memory.
14. **Signed release build:** repeat steps 1, 8 and 10.

## 5. Known limitations

They're shown in the app under "What Spendly doesn't cover", from `TAX_LIMITATIONS`:
- **No filing, no advice.** Spendly doesn't file returns or give tax advice.
- **Estimates are for residents only,** and only for years with verified rules. Only FY 2025-26 today: FY 2024-25 isn't covered (its rates changed mid-year), and FY 2026-27 under the Income-tax Act 2025 waits for verified figures.
- **Not estimated:** business or professional income, crypto and other virtual assets, and land or buildings bought before 23 Jul 2024 (the indexation choice).
- **Not covered:** cross-kind capital-loss set-off and losses carried forward.
- **Not estimated:** surcharge with capital gains above ₹50 lakh, and on dividends above ₹2 crore.
- **Not included:** interest under s.234A/B/C.
- **Filing isn't tracked,** so filing dates stay as reminders.
- **Tax deadline notices are local.** They aren't in server push yet; in push-reminder mode the phone's calendar notices are off.
- **No analytics.** The Expense app has no analytics, so none were added. Rollout is judged by the owner's device journey and support feedback.
