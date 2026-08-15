# Audit Log — Master Index

This directory tracks a running series of codebase audits for the
expense-tracker app. By default each phase is diagnostic only — issues are
logged here in full, with no shortcuts taken in the write-up, and no fixes
are applied during an audit phase unless separately requested. A phase may be
explicitly scoped as an audit-**and**-hardening pass (as Phase 2 was); when
that happens, the phase report says so up front and still logs every issue
in full before describing what was fixed vs. left open. This index is
updated every time a new phase is completed.

## Conventions

- One file per phase: `docs/audits/PHASE_N_<short-topic>.md`.
- Every issue in a phase report must include: what the issue is, why it
  matters, and a concrete failure scenario — not a one-line label.
- Every issue is ranked **P0** (must fix before next release / actively
  dangerous) / **P1** (should fix soon, meaningful risk) / **P2** (should fix,
  moderate impact) / **P3** (worth fixing, low urgency).
- Each phase report ends with a recommended fix order.
- When a later phase re-checks an issue from an earlier phase, it must
  re-verify current file/state before calling it "still open," "fixed," or
  "changed" — never assume a prior finding still holds without looking again.
- This index lists every phase, its date, its scope, and its open P0/P1 count
  at time of writing.

## Phases

| Phase | Date | Scope | Report | Open P0 | Open P1 |
|---|---|---|---|---|---|
| 1 | 2026-08-14 | Architecture, build/test status, dependency review | [PHASE_1_ARCHITECTURE_AUDIT.md](PHASE_1_ARCHITECTURE_AUDIT.md) | 2 | 2 |
| 2 | 2026-08-15 | Security audit **and hardening** (fixes applied, not diagnostic-only) | [PHASE_2_SECURITY_AUDIT.md](PHASE_2_SECURITY_AUDIT.md) | 0 | 2 |
| 3 | 2026-08-15 | Performance audit **and optimization** (fixes applied, not diagnostic-only) | [PHASE_3_PERFORMANCE_AUDIT.md](PHASE_3_PERFORMANCE_AUDIT.md) | 0 | 0 |

## Outstanding Issues Carried Forward

Issues from prior phases that have not yet been confirmed fixed. Re-verify
before closing.

- **[P0]** No ESLint or static-analysis tooling configured. (Phase 1; reconfirmed still true in Phase 2)
- **[P0]** No automated test coverage for any screen/component/provider. (Phase 1; Phase 2 added unit tests for one new security-critical utility only — `lib/pinSecurity.test.ts` — the broader gap remains)
- **[P1]** Firestore rules deployment is a manual, un-enforced step. (Phase 1; reconfirmed in Phase 2 — also means the vault/split rules tightened in Phase 2 must be manually deployed to take effect)
- **[P1]** `READ_SMS`/`RECEIVE_SMS` permissions with no privacy-policy doc located in-repo. (Phase 1)
- **[P1]** Google Sign-In redirect relies on a custom URL scheme, not a verified Android App Link — theoretical interception risk on Android. (Phase 2)
- **[P1]** 25 npm vulnerabilities in the Expo CLI/build-tooling dependency chain (no non-breaking fix available). (Phase 2)
- **[P2]** Unused `zustand` dependency. (Phase 1)
- **[P2]** Android `applicationId` is still the placeholder `com.example.expensetracker`. (Phase 1)
- **[P2]** 13 Context providers composed in `app/_layout.tsx` with no test coverage of that composition. (Phase 1)
- **[P2]** Possible drift between committed and deployed Firestore rules — `system_settings/*` reads have no matching rule in the committed file yet evidently work in production. (Phase 2, sharpens a Phase 1 finding)
- **[P3]** `shared/tsconfig.shared.json` split from main tsconfig, checked only manually. (Phase 1)
- **[P3]** Duress-mode security feature has only one contract test. (Phase 1)
- **[P3]** `(nutrition)` route group appears unrelated to the app's core scope. (Phase 1)
- **[P3]** Firebase Auth session persisted via AsyncStorage on native (Firebase's own recommended RN pattern) — acceptable but worth a deliberate future decision. (Phase 2)
- **[P2]** Likely duplicate Firestore listeners for investments/portfolio data (`useInvestments`/`usePortfolio`, via `useUnifiedNetWorth` + direct Ledger tab usage) — same root cause and same fix pattern as the borrowings/receivables duplication fixed in Phase 3, just not applied yet. (Phase 3)
- **[P3]** Most non-ledger list screens (accounts, borrowings, receivables, spaces, splits, subscriptions, trips, collect) render via unvirtualized `.map()` rather than FlatList/FlashList — acceptable today given naturally small per-user collection sizes, worth revisiting only if that changes. (Phase 3)
- **[P3]** Most collections besides `expenses` are fetched via unbounded (no `limit`/date-range) real-time listeners — acceptable given naturally small cardinality, but worth monitoring. (Phase 3)

## Fixed

- **[Phase 2]** Firestore rules let any vault member/split participant rewrite `ownerId`/`memberIds`/`createdBy`/`participantIds` on update — tightened to owner/creator-only.
- **[Phase 2]** Privacy-lock PIN and duress PIN were stored in plaintext in Firestore — now hashed (SHA-256) before storage, with backward-compatible comparison.
- **[Phase 2]** Android app data was eligible for Auto Backup/`adb backup` extraction (`allowBackup` defaulted to `true`) — explicitly set to `false`.
- **[Phase 3]** Dashboard screen ran duplicate real-time Firestore listeners for borrowings/receivables (once directly, once via `useUnifiedNetWorth`) — consolidated into a single shared `BorrowingsReceivablesProvider`.
- **[Phase 3]** Market-quote polling (`useMarketQuotes`, 60s interval) kept running for screens no longer visible in the navigation stack — gated with `useIsFocused()` so it pauses when unfocused and resumes on refocus.
