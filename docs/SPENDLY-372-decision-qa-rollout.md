# SPENDLY-372 — Money Decisions: QA, privacy, accessibility, performance and rollout

**Ticket:** [SPENDLY-372](https://kesavach.atlassian.net/browse/SPENDLY-372) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-372-decision-qa-rollout`, cut from the epic branch after 370 and merged back with approval.
**Status:** Partial by agreement (2026-10-02). The parts that can be done now are complete. Notification and deep-link QA waits for SPENDLY-371, which is on hold until SPENDLY-222. Android release-build, accessibility and device-performance QA need a device run. **372 stays In Progress, and the epic is not Done.**

---

## 1. Scope status

| Ticket scope item | Status | Where |
|---|---|---|
| Unit/integration tests | Done | 13 decision test files (model, form, links ×2, templates, comparison, commitments, history, outcome, insights, the QA suite, the rules contract) |
| Firebase rules/security tests | Done | `firestore/decisions.rules.test.ts` (10) + `decisionModel.rules.contract.test.ts` + QA §4 |
| Expected-vs-actual calculation tests | Done | `decisionOutcome.test.ts`, `decisionInsights.test.ts`, QA §2 |
| Offline/error/retry behaviour | Done (review + fix, §4) | — |
| Accessibility | **Open:** needs a device | §8 checklist |
| Android performance | **Open:** needs a device | §8 checklist |
| Large-history performance | Done (Node) | QA §6 and per-module 20k tests |
| Notification/deep-link QA | **Open:** needs SPENDLY-371 | — |
| Analytics/observability | Done | §6 monitoring scopes |
| Staged rollout and rollback plan | Done | §6 |

## 2. What the end-to-end suite proves

`shared/utils/decisionJournal.qa.test.ts` (13 tests) takes one decision through its whole life, using the real write builder at every step:

1. start from a template;
2. capture it with rationale and links to an expense, an income and an account;
3. add comparison inputs;
4. decide, then edit the expectation and rationale afterwards;
5. add a commitment and complete it;
6. track, record the outcome and complete the review;
7. reopen, review again, close, archive and restore.

| Guarantee | Result |
|---|---|
| No ledger record is mutated | Linked expense, income and account are byte-identical before and after |
| No money row or ledger-shaped field on a decision | No `amount`, `date` or `accountId`; links carry references only |
| Linked amounts never reach a total | Comparison output is identical with and without links |
| Decide-time snapshot is stable | Identical through edits, outcome, reopen, archive and restore; original expected ₹75,000 is kept while the live value is ₹99,999 |
| Every write is audited, in order | Revisions 1…N, with the status path shown exactly |
| Audit rows never carry content | No rationale, commitment text, outcome text or linked-record labels appear in any event |
| Writes match the rules | Every decision and event field is in the rules' `hasOnly` allowlists; caps match the builder |
| Nothing private reaches logs | Every `logError` in decision code has exactly two arguments (scope, error); this is checked statically |
| Large history | 20,000 decisions: history search, follow-ups and insights together run within 3 s |

## 3. Security and privacy

| Collection | Protection |
|---|---|
| `users/{uid}/decisions/{id}` | Owner and duress twin only. Field allowlist with no money fields. Closed enums. Size caps. `revision` must advance. `createdAtMs` is pinned. The **frozen snapshot is pinned once present.** |
| `users/{uid}/decisionEvents/{id}` | Owner and duress twin only. Append-only (update and delete denied). Field names and statuses only. |

**Other privacy measures:**
- Captured link labels never show more than the last four digits of any number.
- Decision listeners mount only on decision screens.
- Search runs only on the user's own listener; there is no server-side or collection-group search.
- Decisions are deleted with the user (owner delete is allowed). Audit rows are kept, like `ledgerEvents`.

## 4. Offline, loading and error review

| Screen | Loading | Error | Empty | Offline |
|---|---|---|---|---|
| List / history | Skeleton | `ErrorState` + retry | "No decisions yet" / "No decisions match" | Banner; writes queue through the outbox |
| Editor | Skeleton | `ErrorState` + retry; "not here any more" | — | Banner; drafts save offline (the client-side id is created offline) |
| Detail | Skeleton | `ErrorState` + retry | "isn't here any more" | Writes queue; toasts report queued vs on-device-only honestly |
| Compare | Skeleton | `ErrorState` + retry | "No options yet" | Writes queue |
| Insights | Skeleton | `ErrorState` + retry | "Nothing to see yet" | Read-only |
| Linked records | "Loading…" per link | "Couldn't read this right now" per link | — | — |

**Fixed in 372:** the editor stayed on "Loading" forever when no user was signed in. It now says to sign in.

## 5. Known limitations

1. **No Financial Calendar yet.** Review dates and commitment dates are ready to go to SPENDLY-176 through `decisionCalendarEvents`, but nothing renders them in a calendar.
2. **No reminders or notifications.** SPENDLY-371 is on hold until SPENDLY-222.
3. **No insurance module or calendar entity to link to.** Insurance is linked through an expense in an insurance category.
4. **No borrowing, receivable or goal detail route.** Those links open the matching Money hub tab.
5. **Variance only in the same unit.** Expected and actual amounts are compared only when their units match, and the expected amount is entered in ₹.
6. **Theme detection is simple.** It counts repeated title words of four or more letters, in English and Devanagari letters.
7. **Dates are typed as YYYY-MM-DD.** Quick chips help, but there is no native date picker, matching the rest of the app.

## 6. Rollout, rollback and monitoring

**Order matters.** The decision screens read `decisions` on first render. If the app ships before the rules, those screens show a permission error.

1. **Deploy Firestore rules first**, with the manual `firestore-rules-deploy.yml` workflow, after `npm run test:rules` passes. Deploy **rules only, no indexes**: this epic adds none, and the indexes file is a subset of what's live.
2. **Merge the epic** to `main` only with explicit approval and once the open items are accepted or done. Expect a small conflict in `app/(app)/insights.tsx` and the route lists if the fee epic (PR #210) merges first.
3. **Release the app** through the normal release workflow. No native module was added.
4. After release, move the stories to Done.

**Rollback:**
- **App:** revert the merge and release. The `/decisions` routes and entry points disappear.
- **Data:** decisions and their events are additive and never touch ledger rows, so there's nothing to migrate or clean up. Leftover documents are inert.
- **Rules:** the new blocks are harmless if left in place. Revert them with the same workflow if needed.

**Monitoring** (`lib/errors` scopes):
- `snapshot.decisions`: a spike in permission errors means the rules weren't deployed.
- `decisions.save`, `decisions.change`, `decisions.transition`, `decisions.unlink`, `decisions.delete`, `decisions.compare.save`.
- `firestoreWrite.lateFailure` with label `decision`.

## 7. Files

| File | What |
|---|---|
| `shared/utils/decisionJournal.qa.test.ts` (13) | End-to-end QA (§2) |
| `app/(app)/decisions/edit.tsx` | Signed-out state fix |

**Validation:**
- `npm test`: 302 files / 4726 tests.
- `npm run test:rules`: 16 files / 475 tests.
- `typecheck` and `typecheck:shared`: clean.

## 8. Device QA checklist (open)

Use **Spendly Test** against the local emulator (`docs/LOCAL_TEST_MODE.md`), never the real app. Record the display size, density, navigation mode and theme before starting, and restore exactly those afterwards.

- [ ] Run the manual guides in the 363–370 docs, end to end.
- [ ] **Accessibility:**
  - [ ] TalkBack through the editor steps, the comparison cards, follow-up, the outcome sheet and insights;
  - [ ] large font scale;
  - [ ] light and dark themes and a non-default accent;
  - [ ] 3-button and gesture navigation;
  - [ ] touch targets of at least 48 dp.
- [ ] **Keyboard:** in the editor and the compare screen, focus the last field and check it stays visible above the keyboard. Android back with unsaved changes should prompt.
- [ ] **Performance:** seed about 2,000 decisions. Then check:
  - [ ] cold open of `/decisions`;
  - [ ] typing in search (no dropped frames);
  - [ ] opening insights;
  - [ ] heap before and after visiting each decision screen.
- [ ] **Offline:** in airplane mode, create a draft, decide it, record an outcome and dismiss nothing. Check the toasts, then that everything syncs after reconnecting.
- [ ] **Signed release build:** `assembleRelease` with the release key (back up and restore signing around any prebuild). Install over the existing build and smoke-test the above.
- [ ] **Deferred:** notification and deep-link QA, once SPENDLY-371 lands.
