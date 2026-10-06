# SPENDLY-406: Firestore Read Optimization & Usage Control

## Overview
Systematically reduce Spendly Firestore document reads from ~24K reads/day to sustainable, budgeted usage while preserving Firebase as the backend, realtime synchronization, offline behavior, financial correctness, and security.

## State
- **SPENDLY-407**: Merged into epic branch
- **SPENDLY-408**: Merged into epic branch
- **SPENDLY-409**: Merged into epic branch
- **SPENDLY-410**: Merged into epic branch
- **SPENDLY-411**: Merged into epic branch
- **SPENDLY-412**: Implemented on branch `feature/SPENDLY-412-optimize-reference-data-sync` (Optimize Reference Data Sync) — not yet merged into epic branch
- **SPENDLY-413**: To Do (Dashboard Summary Aggregation)
- **SPENDLY-414**: To Do (AppState & Reconnect Debounce)
- **SPENDLY-415**: To Do (Read Budget & Regression Protection)
- **SPENDLY-416**: To Do (QA Matrix, Correctness & Rollout Sign-Off)

## Decisions
- Preserving Firebase/Firestore as the sole database architecture; no migration to other backends.
- Retaining realtime listeners and offline disk persistence cache across all core financial entities.
- Removing the background idle upgrade that converts bounded queries into unlimited queries in `FinanceDataProvider.tsx`.
- Implementing cursor-based pagination for ledger views.
- Scoping `categoryBudgets`/`financialGoals` listeners to the Active-On-Demand pattern (SPENDLY-411); `categories`/`subscriptions`/`spaces`/`categorizationRules` stay eager because they're read from pervasive ledger surfaces.
- Converting `spaces`/`categorizationRules` from realtime listeners to one-shot reads with write/foreground-triggered refresh (SPENDLY-412); `categories`/`subscriptions` stay realtime but gained defensive `limit(...)` bounds.
