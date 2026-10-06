# SPENDLY-406: Firestore Read Optimization & Usage Control

## Overview
Systematically reduce Spendly Firestore document reads from ~24K reads/day to sustainable, budgeted usage while preserving Firebase as the backend, realtime synchronization, offline behavior, financial correctness, and security.

## State
- **SPENDLY-407**: Merged into epic branch
- **SPENDLY-408**: Merged into epic branch
- **SPENDLY-409**: Merged into epic branch
- **SPENDLY-410**: Complete (Ready for user review and merge into epic branch)
- **SPENDLY-411**: To Do (Feature-Scoped Listener Lifecycle)
- **SPENDLY-412**: To Do (Optimize Reference Data Sync)
- **SPENDLY-413**: To Do (Dashboard Summary Aggregation)
- **SPENDLY-414**: To Do (AppState & Reconnect Debounce)
- **SPENDLY-415**: To Do (Read Budget & Regression Protection)
- **SPENDLY-416**: To Do (QA Matrix, Correctness & Rollout Sign-Off)

## Decisions
- Preserving Firebase/Firestore as the sole database architecture; no migration to other backends.
- Retaining realtime listeners and offline disk persistence cache across all core financial entities.
- Removing the background idle upgrade that converts bounded queries into unlimited queries in `FinanceDataProvider.tsx`.
- Implementing cursor-based pagination for ledger views.
