# Phase 5 — Data Layer Testing Notes

**Status:** Phase 5 delivered an in-memory ledger harness + pure ledger guards. Full Firebase Emulator integration against `FinanceDataProvider` remains a follow-up.

## What landed

| Artifact | Role |
|----------|------|
| `lib/finance/ledgerGuards.ts` | Pure pending-count sum, payment validation, account-delete gate |
| `lib/finance/memoryLedger.ts` | In-memory CRUD simulating `users/{uid}/…` collections |
| `lib/syncStatusStore.ts` | Added `getGlobalPendingSyncCount()` for tests |
| Wired into `FinanceDataProvider` | Uses guards for pending total, payments, account delete |

## Emulator plan (not installed in this phase)

Recommended when Ready for live Firestore integration tests:

1. Add `firebase-tools` (dev) and `firebase.json` with Auth + Firestore emulators.
2. Use a dedicated test project id / `.env.test` — never production.
3. Start emulators in CI/local: Auth `9099`, Firestore `8080`.
4. Point the Firebase client at emulators (`connectAuthEmulator` / `connectFirestoreEmulator`).
5. Cover: expense create/update/delete, pending `hasPendingWrites` → sync banner, reconnect after offline.

Until then, `memoryLedger` covers uid isolation (duress vs real) and CRUD/linked-delete contracts without network.

## Production isolation

Automated tests must not use production Firestore credentials or live user data.
