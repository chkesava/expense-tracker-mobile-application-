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
| 4 | 2026-08-15 | Memory management & battery/power efficiency audit **and fixes** (fixes applied, not diagnostic-only) | [PHASE_4_MEMORY_POWER_AUDIT.md](PHASE_4_MEMORY_POWER_AUDIT.md) | 0 | 0 |
| 5 | 2026-08-15 | Financial calculations & data integrity audit **and fixes** (fixes applied, not diagnostic-only) | [PHASE_5_FINANCIAL_INTEGRITY_AUDIT.md](PHASE_5_FINANCIAL_INTEGRITY_AUDIT.md) | 0 | 0 |
| 6 | 2026-08-15 | UI/UX audit **and fixes** (fixes applied, not diagnostic-only) | [PHASE_6_UI_UX_AUDIT.md](PHASE_6_UI_UX_AUDIT.md) | 0 | 0 |
| 7 | 2026-08-15 | Push/local notifications audit **and fixes** (fixes applied, not diagnostic-only) | [PHASE_7_NOTIFICATIONS_AUDIT.md](PHASE_7_NOTIFICATIONS_AUDIT.md) | 0 | 0 |
| — | 2026-08-22 | Credit card model revalidation (cycles, statements, payment allocation, available credit, net-worth consumers) **and fixes** | [credit-card-model-validation-2026-08-22.md](credit-card-model-validation-2026-08-22.md) | 0 | 0 |

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
- **[P3]** `ReceiptScannerModal`'s simulated-OCR `setTimeout` isn't cancelled if the modal is closed and reopened mid-delay — low risk (1.2s, single-shot, component doesn't unmount), a correctness nit-pick more than a memory/battery cost. (Phase 4)
- **[P2]** Credit card billing-cycle "today" uses raw device-local time (`getBillingCycleDates()`), not the user-configurable `settings.timezone` used elsewhere in the app — could misattribute an expense to the wrong billing cycle right at a boundary if a user's app timezone differs from their device's. Needs a product decision (should billing cycles ever follow anything but the device clock?) before fixing, since it touches every caller of `getBillingCycleDates`/`computeCreditUsage`/`getCreditBillHistory`. (Phase 5)
- **[P3]** `AccountPayment` records with no explicit `appliedCycleStart`/`appliedCycleEnd` fall back to date-range matching that can attribute a payment made exactly on a cycle's close date to the next cycle instead of the one that just closed. Not currently reachable for new payments (the app always sets these fields explicitly), but relevant for any legacy untagged payment records. (Phase 5)
- **[P2]** The app's `ErrorBoundary` is expo-router's unstyled default — an uncaught render error shows a generic, unthemed crash screen instead of one matching the app's design. Needs a new themed component (with retry action, safe-area/dark-mode support), not a small contained fix. (Phase 6)
- **[P3]** 9 non-functional `ThemeName` values remain in `theme/tokens.ts` (`midnight`, `midnight-olive`, `vintage-parchment`, `sakura-bloom`, `cyberpunk`, `nordic`, `deep-sea`, `glass-3d`, `claymorphism`) — Phase 6 stopped the Settings picker from offering them, but the type/labels/classification still exist. Needs either real distinct palettes or removal (bigger change — persisted to Firestore/AsyncStorage for any user who already has one stored). (Phase 6)
- **[P3]** `Card.tsx`'s title uses a magic `fontSize: 17` outside the theme's typography scale (12/14/16/18/22/28) — minor, cosmetic, single occurrence. (Phase 6)
- **[P3]** Phase 6 reviewed shared design-system components and the highest-traffic patterns in depth but did not do an exhaustive per-screen visual pass over all ~40+ screens; the consistent use of shared `Card`/`Button`/`Modal` components makes drift less likely, but a device-screenshot-based pass would catch more. (Phase 6)
- **[P2]** No device-level verification of any Phase 7 notification fix was possible in this environment (identifier-based dedup, cold-start tap handling, dismiss-on-resolve) — verified by code reading and unit-testable pure logic only. A future phase with device access should confirm each on a real Android build. (Phase 7)
- **[P3]** A theoretical SMS-dedupe race (two overlapping `processIncomingSmsMessages` calls both reading the dedupe-key set before either persists) was not confirmed reachable — the Phase 7 identifier fix closes it as defense-in-depth regardless, but a dedicated concurrency audit of the SMS pipeline would be worth a future phase if duplicate SMS notifications are ever reported. (Phase 7)
- **[P3]** Notification permission is requested opportunistically at first use (first bill reminder / first SMS event) rather than via one unified onboarding prompt — a product/UX question, not a reliability bug. (Phase 7)

## Fixed
- **[Credit card revalidation 2026-08-22]** The stored `amountPaid` floor in `buildCreditCardLedger` had no date guard and no provenance check, so on a non-auto (or PAID) statement it credited money that allocation had deliberately withheld because the payment predated the statement — while the same money also stayed in `freeCredit`. A ₹19,000 payment dated 13 Aug against a ₹28,101 statement closing 20 Aug showed the statement as PARTIALLY PAID with ₹9,101 remaining *and* kept ₹19,000 as unapplied credit, understating the card liability in net worth by ₹19,000. The floor now covers out-of-band settlements only (the part of `amountPaid` no linked payment explains) and never applies to a statement that has not closed yet.
- **[Credit card revalidation 2026-08-22]** Auto statement generation only ever drafted the *latest* closed cycle, so a user who did not open the app for two or more cycles never got statement documents (or reminders) for the cycles they missed — the ledger already derived and billed those windows, so the position was right but the documents were absent. `collectAutoCreditCardBillDrafts` now backfills the last 12 closed cycles (matching the ledger's derived-cycle depth), skipping cycles with no spend, and the refresh pass repairs the backfilled documents too. Purely additive: verified that the ledger already reported those cycles as due, and that the 30-day reminder horizon means backfilled statements more than a month past due schedule zero notifications.
- **[Credit card revalidation 2026-08-22]** `PayCreditBillModal` picked its payment target by `dueDate` with no date guard and stamped the **full** payment amount onto it, so a backdated payment or a manually created future-dated statement wrote `amountPaid > 0` onto a statement the payment cannot settle, and an overpayment wrote `amountPaid > statementAmount` (rendered raw as "Amount paid" on the bill detail screen). It now only stamps a statement whose `statementDate <= payment date`, and only up to what that statement still owes.

- **[Phase 2]** Firestore rules let any vault member/split participant rewrite `ownerId`/`memberIds`/`createdBy`/`participantIds` on update — tightened to owner/creator-only.
- **[Phase 2]** Privacy-lock PIN and duress PIN were stored in plaintext in Firestore — now hashed (SHA-256) before storage, with backward-compatible comparison.
- **[Phase 2]** Android app data was eligible for Auto Backup/`adb backup` extraction (`allowBackup` defaulted to `true`) — explicitly set to `false`.
- **[Phase 3]** Dashboard screen ran duplicate real-time Firestore listeners for borrowings/receivables (once directly, once via `useUnifiedNetWorth`) — consolidated into a single shared `BorrowingsReceivablesProvider`.
- **[Phase 3]** Market-quote polling (`useMarketQuotes`, 60s interval) kept running for screens no longer visible in the navigation stack — gated with `useIsFocused()` so it pauses when unfocused and resumes on refocus.
- **[Phase 4]** `CelebrationOverlay`'s background glow used an infinite Reanimated `withRepeat(-1)` with no cancellation, on a component that's permanently mounted at the app root — once triggered, it animated on the UI thread forever in the background. Now cancelled when dismissed, plus an unmount safety net.
- **[Phase 4]** `AiAdvisorView` could set state after unmount (chat-history load + simulated-response timer) since it's conditionally unmounted when switching Insights tabs — both now guarded/cleared.
- **[Phase 4]** `CreditCardBillsProvider`'s debounced reconcile timer wasn't cleared on unmount, so it could fire after logout using stale closures — now cleared.
- **[Phase 5]** `getCreditBillHistory()` used exact `outstandingAmount === 0` on unroundeded floating-point sums — a bill paid in full could stay stuck as "partiallyPaid" forever due to float residue (e.g. `0.1 + 0.2 !== 0.3`). Added a `roundMoney()` helper (matching the one already used in `borrowingMath.ts`/`receivableMath.ts`) across every computed value in `accountBalance.ts`, and changed the check to `<= 0`. Verified as a real, reproducible bug (not theoretical) by confirming the new regression test fails without the fix.
- **[Phase 6]** 18 modal close buttons (same copy-pasted pattern across the app) had ~28-36dp touch targets, well under Android's 48dp minimum, and no accessibility label — added `hitSlop={12}` plus `accessibilityRole`/`accessibilityLabel` to all 18, with zero visual change.
- **[Phase 6]** Settings' "Theme Presets" picker offered 9 named themes (Cyberpunk, Sakura Bloom, Nordic, etc.) that all resolve to the exact same colors as plain Light/Dark — trimmed the picker to the 2 options that actually produce a distinct look.
- **[Phase 7]** SMS transaction notifications (detected/auto-added/recurring) had no stable identifier, unlike the credit-card bill reminder system — added deterministic per-transaction/per-pattern identifiers so a re-presented entry replaces rather than duplicates.
- **[Phase 7]** Tapping a notification that cold-started the app (fully killed, not backgrounded) never navigated anywhere — added a `getLastNotificationResponseAsync()` check alongside the live listener, with a dedupe guard.
- **[Phase 7]** Notification-tap navigation was gated to Android-only inside an SMS-specific provider, silently breaking bill-reminder tap navigation on iOS (bill reminders are scheduled on every platform) — un-gated that one effect.
- **[Phase 7]** Resolving a detected-transaction notification in-app (add or ignore) never cleared the original OS notification, leaving a stale one in the shade — `dismissSmsReviewItem()` now dismisses it via the same stable identifier.
