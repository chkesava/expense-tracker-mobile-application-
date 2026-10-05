# SPENDLY-202 — Saved What-If Scenarios and Lifecycle

**Ticket:** [SPENDLY-202](https://kesavach.atlassian.net/browse/SPENDLY-202) · **Epic:** [SPENDLY-195](SPENDLY-195-what-if-simulator.md)
**Branch:** `feature/SPENDLY-202-saved-scenarios-lifecycle`, cut from `feature/SPENDLY-195-what-if-simulator`.
**Scope:** data layer only (contract, store, live hook, rules). No screen; see "Not in this story".

## Delivered

**First pass (2928deb):**
- `shared/utils/whatIfScenarios.ts`: the persistable scenario contract.
- `services/whatIf/whatIfScenarioStore.ts`: the store, through the offline `commitMutations` outbox.
- Owner-only `users/{uid}/whatIfScenarios/{id}` rules.
- Emulator and contract tests.

**Completion pass, fixes:**
- **Saves were always rejected.** The stored body carried the definition's `id`, but the rule's `hasOnly` list doesn't allow `id`, so every real save failed. The old emulator tests passed only because they wrote hand-built bodies without `id`.
  - Identity is now the **document id**, and the stored body never carries `id`.
  - On read, the document id always wins over any stray field.
- **Duplicate collisions.** Duplicates used `"<id>-copy"`, so a second duplicate overwrote the first. A duplicate is now a brand-new document, with `fromId` provenance in its history.

**Completion pass, added:**
- **Traceable changes:** a capped `history` of up to 20 entries, each `{version, atMs, action, fields, fromId?}`.
  - Actions: created, edited, renamed, archived, restored, duplicated, rebased.
  - The version never goes backwards; the rules enforce this.
  - A no-op edit, archive or rebase returns `null` and writes nothing.
- **An explicit recalculation rule (`whatIfCalculationReference`):**
  - `saved` (the default on reopen): use the scenario's own as-of date, currency and timezone against current canonical records.
  - `current`: use today's reference. Making this permanent is a **rebase**, which is a versioned change.
  - No financial records are snapshotted, so "saved baseline" means the saved reference, recomputed from canonical data.
- **`whatIfRecalculationStatus`:** reports which sources changed since the scenario was saved, whether the currency changed, and whether the engine version changed, so the UI can show "inputs changed since you saved".
- **Last calculated (`lastCalculated`):** `{atMs, engineVersion, mode, asOfDate}`, recorded by `recordWhatIfScenarioCalculation`.
  - It's metadata only; the projection output is never stored.
  - Editing assumptions clears it. Renaming keeps it.
- **`hooks/useWhatIfScenarios.ts`:** a live listener using the established pattern (`useLoadFailure`, `snapshotErrorHandler`, `forgetSnapshotPath`). It serves cached data offline and exposes `error` and `retry`.
- **Store operations:** create, update, rename, archive or restore, duplicate, rebase, record a calculation, delete.

## Acceptance criteria

| Criterion | Evidence |
|---|---|
| Saved scenarios persist securely per user | Owner and duress rules; cross-user and unauthenticated denial tests |
| Editing changes only the scenario | Builders touch only the scenario body; the store writes only `whatIfScenarios/{id}` |
| Deleting never deletes financial records | `deleteWhatIfScenario` deletes one scenario document |
| Duplicate is independent | New document, version 1, active, deep-copied lists, `fromId` provenance |
| Version and assumption changes traceable | `history` with the changed fields; version can't decrease (emulator test) |
| Offline and error states handled | Outbox writes; the live hook serves cache and has `error`/`retry` |
| Rules prevent cross-user access | `firestore/whatIfScenarios.rules.test.ts` |
| Reopening is reproducible | `toWhatIfScenarioDefinition` rebuilds the exact definition, and the engine is deterministic |

**Tests:**
- `whatIfScenarios.test.ts`: 17 tests.
- `whatIfScenarios.rules.contract.test.ts`: 2 tests. The fields match the builders, `id` is excluded, and the limits and modes are checked.
- `firestore/whatIfScenarios.rules.test.ts`: 5 tests. Every body the **real builders** produce is accepted. An `id` field, calculated output, oversized history and a decreasing version are rejected.

## Not in this story
- **The What-If screens.** No story in 196–202 adds a route. A saved-scenarios list, editor and comparison screen still need an owner; this was raised with the user.
- **Rules deploy:** part of the rollout, after the epic reaches `main`.

## Manual testing guide
No screen exists yet, so verification is automated:
```text
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
npm run test:rules          # needs port 8080 free
```
Once a screen exists, test on device in Spendly Test:
- create, edit, rename, duplicate, archive, restore and delete a scenario;
- reopen it after changing data, and check the "changed since saved" notice;
- go offline, make an edit, then reconnect;
- check that no transaction, account, goal or investment changed.
