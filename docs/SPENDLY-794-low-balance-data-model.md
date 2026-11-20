# SPENDLY-794: Low-balance alerts — data model

**Epic:** SPENDLY-793 (low-balance alerts before auto-debits). **Story:** S1 of 6.

**State:** built on `feature/SPENDLY-794-low-balance-data-model`. Nothing is deployed. The rules change has to be deployed before any app build that writes these fields.

## What changed
These fields only store the user's choices. Nothing reads them yet: S2 adds the shortfall engine, S3 the server job, S4 the push source and S5 the UI.

- **`Subscription.lowBalanceLeadDays?: number | null`**: how many days before this item's debit to start checking the paying account. When it is missing or null, the user's default applies.
- **Card `Account` fields** (alerts only; Spendly never pays anything):
  - `autopayFromAccountId?: string | null`: the bank account the card's autopay mandate debits.
  - `autopayAmountMode?: "total" | "minimum" | null`: whether the mandate pays the remaining total or the minimum due. A missing value is read as `total`, the safer figure to warn on.
  - `autopayLeadDays?: number | null`.
- **`UserSettings.lowBalanceAlerts.defaultLeadDays`**: defaults to 3. A bad stored value falls back to the default (`normalizeLowBalanceAlerts`). The on/off switch will be the `lowBalance` push category added in S4.
- **`shared/utils/lowBalanceAlerts.ts`** (pure):
  - the range constants: 0–15 days, default 3, and the UI choices 1/3/5/7;
  - `resolveLeadDays` and `subscriptionLeadDays`;
  - `cardAutopay`, which returns null when no account is linked or the link points at the card itself.

## Write path (dual write)
- **Subscriptions:** no writer change was needed. `useSubscriptions.add/updateSubscription` already write any `Subscription` field through `commitWrite` and `noteDirectWrites`.
- **Accounts:** the three keys are added to `ACCOUNT_EXTRA_KEYS` in `shared/utils/accountIdentity.ts`, so `buildAccountWritePayload` passes them through `FinanceDataProvider.updateAccount` / create → `commitMutations`. Null is written as null, which clears the link. `undefined` is still dropped.
- **Settings:** stored on `users/{uid}` by the existing settings writer.

## Read model
**No migration and no `TableSpec` change.** Per R2.2, only fields that SQL filters or sorts on get a typed column. These fields are only read by TypeScript, and the row's `doc` jsonb always holds the whole document. So they reach Supabase through the existing `subscriptions` / `accounts` rows and the `rm_client_apply` path, and no allowlist change is needed.

The plan had listed a migration "if needed". If S3's job later has to filter on a column, that column will come with its own migration.

## Firestore rules
- `optionalLeadDays(d, key)`: the field is missing, null, or an int from 0 to 15.
- `subscriptions` now also requires `optionalLeadDays(d, 'lowBalanceLeadDays')`.
- `accountWellFormed(accountId)` also runs `accountAutopayWellFormed`:
  - the mode is in `total | minimum`, or null;
  - the paying account is a non-empty string of at most 128 characters, or null, and **is not the card's own id**.

## Tests
- `shared/utils/lowBalanceAlerts.test.ts`: range, resolution order, and the card link (none, self, fallbacks).
- `shared/utils/accountIdentity.test.ts`: the autopay link is persisted, null clears it, and a missing link is not written.
- `shared/types/settings.test.ts`: defaults, nested and top-level values, and repair of bad values.
- `firestore/lowBalanceAlerts.rules.test.ts`: the subscription lead-day range, the autopay link and clear, a card paying itself, and bad modes, ids and lead days.

## Deploy order
Deploy the rules (`firestore-rules-deploy.yml`) first. The new rules only add checks on fields no client writes yet, so they are safe to deploy before the app.
