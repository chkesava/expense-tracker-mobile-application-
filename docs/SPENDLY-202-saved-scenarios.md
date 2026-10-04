# SPENDLY-202 — Saved What-If Scenarios and Lifecycle

## Delivered

- Added `shared/utils/whatIfScenarios.ts` for the persistable scenario contract, validation, edit versioning, duplication, archive ordering, and pinned timestamps.
- Added `services/whatIf/whatIfScenarioStore.ts` using the durable offline `commitMutations` outbox.
- Added owner-only `users/{uid}/whatIfScenarios/{id}` rules with strict top-level schema, engine/duration/size bounds, immutable `createdAtMs`, and no calculated/ledger fields.
- Added shared rules contract tests and Firestore emulator tests for owner isolation, duress ownership, lifecycle writes, malformed values, and pinned creation time.

Only scenario assumptions and reproducibility metadata are persisted. Reopening a scenario must recalculate against current canonical records while retaining its original reference metadata. Deleting or archiving a scenario never touches financial records.

## Manual Testing Guide

1. Create a named What-If scenario and confirm it appears in the saved-scenarios list.
2. Edit assumptions and confirm the scenario version increments while `createdAtMs` remains unchanged.
3. Duplicate a scenario and confirm the copy has independent identity, version one, and no archive flag.
4. Archive and unarchive a scenario; confirm active scenarios sort before archived scenarios.
5. Reopen a saved scenario after changing canonical financial data; confirm results recalculate while the saved reference date remains visible.
6. Delete a scenario and verify goals, transactions, investments and other canonical records remain unchanged.
7. Exercise offline mode, force-close/reopen, and reconnect; confirm writes remain in the durable outbox and are replayed once.
8. Verify a second authenticated user cannot read, create, update, archive, or delete another user's scenario.

## Commands

```text
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
npm run test:rules
```

Rules tests require the local Firestore emulator. Do not deploy rules as part of this story.
