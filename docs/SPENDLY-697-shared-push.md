# SPENDLY-697: Push for shared splits and vaults

**Ticket:** [SPENDLY-697](https://kesavach.atlassian.net/browse/SPENDLY-697) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-697-shared-push`, cut from the epic branch after the 229 merge.

## What it does

A shared-money event source (`shared/utils/push/sources/sharedEvents.ts`) runs on the hourly event pass from 229. It reuses that pass's rules: sent once per event, an inbox row for every notice, held for the delivery window, preferences ("Shared splits and vaults", 226) applied by the sender, and runs only count real deliveries.

**Recipients** are always read from the current document at poll time. A push never goes to anyone outside the split or vault, and **never to the person who acted**.

| Event | Who hears | Notes |
|---|---|---|
| **New split** | Every participant except the organiser | "Priya added you to a split". Only the organiser can write a split (firestore.rules), so the organiser is always the actor. |
| **Split settled** | Every participant except the organiser | When it **first** becomes settled. The app now stamps `settledAt` once (`settledAtPatch` in the one function every split write goes through). |
| **"I've paid" / opt-out claim** (filed anonymously from the public page) | **The organiser only** | Named from the public share. Each filing notifies once: the slot is re-armed after apply or dismiss, so the key includes the claim's `updatedAt`. |
| **Vault deposit or withdrawal** | Every member and the owner, except whoever recorded it | "Kiran added a deposit to House fund". A vault with nobody else is skipped. |
| Soft-deleted split (`deletedAt`) | Nobody | |
| Not-settled split with a stale `settledAt` | Nobody | |

- **No amounts** in any text.
- **Taps** open `/vaults?tab=splits` or `/vaults?tab=shared` (allow-listed by 230).

**Reads** (Spark budget), hourly:
- splits created or settled in the last day;
- claims filed in it, plus each claim's public share;
- the vault list, plus each vault's new entries.

All use single-field queries on top-level collections or a vault's own subcollection, so **no new indexes**. A collection-group query on `expenses` would also read every user's own expenses, so the source deliberately goes vault by vault.

## Files

| File | |
|---|---|
| `shared/utils/push/sources/sharedEvents.ts` | `createSharedEventSource`, `otherMembers` |
| `shared/utils/splitSettled.ts` | `settledAtPatch` |
| `hooks/useSplits.ts` | Stamps `settledAt` the first time a split is settled |
| `shared/types/split.ts` | `settledAt?: number` |
| `scripts/push-reminders.ts` | The shared source joins `buildEventSources` |

## Tests

- `shared/utils/push/sources/sharedEvents.test.ts`:
  - a new split notifies the others but not the organiser, with no amounts, once;
  - settled in the last day notifies, an old settle doesn't;
  - deleted, and stale `settledAt`, are silent;
  - claims go to the organiser only, named, once per filing, with opt-out wording;
  - a claim for a missing share is skipped;
  - a vault entry notifies the others but not the actor, old entries are skipped, and a solo vault is silent;
  - `otherMembers`.
- `shared/utils/splitSettled.test.ts`: stamps only on the first settle.

## Go-live

No deploy: no new indexes or rules. The `settledAt` stamp ships with the app release (B5). Splits settled before that release never notify as "settled", which is fine.
