# SPENDLY-725 — 682-A: server foundations for the daily jobs

Sub-task of SPENDLY-682 ([plan](SPENDLY-682-plan.md), [tracker](SPENDLY-682-legacy-crons.md)). Branch `feature/SPENDLY-725-daily-job-foundations`, cut from `feature/SPENDLY-682-legacy-crons-in-repo`.

## What it adds
| Change | Files |
|---|---|
| **`startOfDayInTimeZone(dateKey, tz)`**: the instant a calendar day starts in an IANA zone (DST-safe). It is what a phone in that zone gets from `new Date(y, m, d)`. | `shared/utils/dates.ts` (+ tests) |
| **Timezone-aware SIP keys.** The date helpers and `decideSipRun` take an optional `timeZone`: `localDateKey`, `sipScheduledKey`, `startOfLocalDay`, `calculateNextExecutionDate` and `isSipDue`. Without it nothing changes (device local, as before). With it, a UTC server computes the same "today", scheduled key, transaction id and next date as the user's phone. | `shared/features/sip/utils/sipExecution.ts` (+ tests) |
| **`refreshCreditCardBillDerivedFields`** (status, remaining, next reminder): moved unchanged from the provider to `shared/`, so the server bill job stamps what the app stamps. The provider imports it. | `shared/utils/creditCardBillDerived.ts` (+ tests), `providers/CreditCardBillsProvider.tsx` |
| **`dailyJobCore`**: the shared, pure core of the daily jobs (`applyJobWrites`, summary, budget). | `scripts/lib/dailyJobCore.ts`, `scripts/dailyJobCore.test.ts` |

## How `applyJobWrites` behaves
- **Scope:** writes only the user's own `users/{uid}/…` documents. Duress trees are skipped; anything else throws.
- **Stamps:** `createdAt` + `updatedAt` on create, and `updatedAt` on set/update (R1.2).
- **Atomic:** one batch per call, all or nothing.
- **Conflicts:**
  - a `create` of an existing document → `conflict`;
  - an `update` with a stale `lastUpdateTime` → `conflict`.
  - Nothing is written and nothing is pushed. This makes reruns and the app racing the job safe.
- **Read-model push:** after a commit, exactly the written paths go to the push (SPENDLY-680). The CLI scripts wire `createServerPush(serverPushPorts(db))`.
- **Dry run:** logs each write and writes nothing.
- **Summary:** counts writes, conflicts and failures (reasons, never uids), plus reads, budget stop and push figures, with GitHub annotations.

## Invariant kept
The app's SIP and bill outcomes are unchanged:
- every new parameter is optional;
- the moved function is byte-for-byte the same logic;
- the existing tests pass untouched.

## Found and logged separately
**SPENDLY-731:** monthly day 29–31 SIPs skip a month. `setMonth(+1)` overflows, so 31 Jan → 31 Mar. This story keeps the rule, so the server matches the phone, and the test documents it.

## Tests
- `shared/utils/dates.test.ts`: midnight in IST/UTC/New York, DST both ways, round trip.
- `shared/features/sip/utils/sipExecution.test.ts`:
  - with no zone, results are identical;
  - IST scheduled key and due check on a UTC runner;
  - next date for every frequency equals the phone's;
  - `decideSipRun` ids match an IST phone.
- `shared/utils/creditCardBillDerived.test.ts`: PAID / PARTIALLY_PAID / OVERDUE by zone / CANCELLED kept.
- `scripts/dailyJobCore.test.ts`: atomic write + stamps + push, create conflict, compare-and-set conflict, dry run, duress, foreign path and oversize refused, failure reason, summary and annotations.
