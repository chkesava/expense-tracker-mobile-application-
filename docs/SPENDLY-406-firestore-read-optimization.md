# SPENDLY-406: Firestore Read Optimization & Usage Control

## Overview
Systematically reduce Spendly Firestore document reads from ~24K reads/day to sustainable, budgeted usage while preserving Firebase as the backend, realtime synchronization, offline behavior, financial correctness, and security.

## State
- **SPENDLY-407**: Merged into epic branch
- **SPENDLY-408**: Merged into epic branch
- **SPENDLY-409**: Merged into epic branch
- **SPENDLY-410**: Merged into epic branch
- **SPENDLY-411**: Merged into epic branch
- **SPENDLY-412**: Merged into epic branch
- **SPENDLY-413**: Merged into epic branch (safety-net scope; full balance-summary follow-up tracked separately)
- **SPENDLY-414**: Merged into epic branch (audit-only — no read amplification found)
- **SPENDLY-415**: Merged into epic branch
- **SPENDLY-416**: Implemented on branch `feature/SPENDLY-416-qa-rollout-signoff` (QA Matrix, Correctness & Rollout Sign-Off) — not yet merged into epic branch
- **SPENDLY-418**: To Do (Per-Account Running Balance Summary — follow-up from SPENDLY-413's `liquidBalanceMayBePartial` finding)

## Decisions
- Preserving Firebase/Firestore as the sole database architecture; no migration to other backends.
- Retaining realtime listeners and offline disk persistence cache across all core financial entities.
- Removing the background idle upgrade that converts bounded queries into unlimited queries in `FinanceDataProvider.tsx`.
- Implementing cursor-based pagination for ledger views.
- Scoping `categoryBudgets`/`financialGoals` listeners to the Active-On-Demand pattern (SPENDLY-411); `categories`/`subscriptions`/`spaces`/`categorizationRules` stay eager because they're read from pervasive ledger surfaces.
- Converting `spaces`/`categorizationRules` from realtime listeners to one-shot reads with write/foreground-triggered refresh (SPENDLY-412); `categories`/`subscriptions` stay realtime but gained defensive `limit(...)` bounds.
- SPENDLY-413 scoped to a read-side safety net (trim the cash-flow chart to trustworthy months; flag net worth as possibly partial when an account has no balance baseline and the ledger is staged). The full per-account running-balance summary is deferred to **SPENDLY-418** — it needs `increment()` wiring across every balance-affecting write site plus a migration/rebuild strategy, which is its own story's worth of risk.
- SPENDLY-414 closed as audit-only: no unbounded Firestore read amplification from AppState/reconnect/auth-token-refresh transitions exists (already addressed incidentally by SPENDLY-409–412). `CreditCardBillsProvider`'s CPU-only duplicate recompute on every foreground was confirmed with the user as out of scope (not a read problem).
- SPENDLY-415 is documentation + static-analysis tooling only (numeric budgets, 3 new `perf:verify` regression checks, a dev-only `spendlyReadStats()` console hook) — no provider/read-behavior changes. No new debug UI screen or automated emulator-benchmark harness; both flagged as possible future tickets if wanted.
- SPENDLY-416 ran the full QA matrix on a real physical device against the Firebase Local Emulator Suite. No P0/P1 defects. Corrected SPENDLY-415's `categories` budget estimate from an unmeasured "<50" to a measured ~287 docs (steady-state, not one-time) after seeing it on device. Process-death rows (5/6) were inconclusive due to this specific OEM device retaining process state across `am force-stop` — flagged as a non-blocking optional re-check, not a defect.
