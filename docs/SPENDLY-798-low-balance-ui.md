# SPENDLY-798: Low-balance alerts — app UI

**Epic:** SPENDLY-793. **Story:** S5 of 6.

**State:** built on `feature/SPENDLY-798-low-balance-ui`. Awaiting the owner's UI review on local Expo web. Nothing is deployed.

## What the user sees

### Settings → Notifications
- **"Low balance before auto-debits"** switch (added in S4), on by default.
- **"Start warning"**: the default lead days (1, 3, 5 or 7). Shown only while the switch is on.

### Recurring item form (step 3)
- **"LOW-BALANCE ALERT"**: `Default (N days)`, or 1, 3, 5 or 7 days.
- Shown only when the item has a paying account.
- Saving `Default` removes the override (`lowBalanceLeadDays` deleted), so the item follows the setting.

### Card account form (Credit Card Settings)
- **"Autopay from"**: `No autopay` or any non-card account (never the card itself).
- **"Autopay pays"**: Total due / Minimum due.
- **"Low-balance alert"**: lead days, with `Default`.
- `No autopay` clears all three fields to null. Non-card accounts leave the fields alone.
- The helper text says Spendly never pays anything itself.

### Recurring list
A **"LOW BALANCE"** badge (warning tint) appears beside the existing OVERDUE and PAUSED badges.

### Recurring item screen
A banner under the header: "Short by ₹2,000 on HDFC Savings · ₹12,000 is due 22 Nov. Add money before it's debited."

### Account screen (overview)
- **A card:** its autopay shortfall.
- **A bank account:** every debit it pays that falls short, each with the item named.
- **An untrusted balance:** a grey "Can't check {account}… needs reconciliation" note, with no figure.

### Dashboard
- A **"Low balance ahead"** card in the shared notices block, on both the phone and desktop layouts.
- Up to 4 rows: item, account, due date, amount and "Short ₹X". Each row opens the recurring item or the card's bill, the same targets as the push. More than 4 are counted in the subtitle.
- Hidden when nothing is short.

## Rules kept
- **No calculation in the app (epic 735):** every figure is the server's stored `shortBy` / `amount` from `serverResults/autoDebitShortfall`.
- `shared/utils/lowBalanceDisplay.ts` only chooses which stored items apply on the viewer's day:
  - the window is `dueDate − leadDays` through `dueDate`;
  - a result more than a day old is ignored, so nothing stale shows;
  - untrusted accounts show as "unverified".
- **Read switch:** `useLowBalanceAlerts` reads through `useServerResults`, which gains `docId`:
  - In `supabase` mode it filters the on-device copy, with no listener.
  - Otherwise it listens to **one document**, so the dashboard never loads the fee-row parts (up to about 600 KB each).
  - Shadow comparison is skipped for a single document. `listenersOff` and `providerSwitch` stay green.
- **Writes** use the existing paths:
  - `useSubscriptions.updateSubscription`, where `withFieldDeletes` turns `undefined` into a delete;
  - `updateAccount` / `addAccount` → `buildAccountWritePayload` (S1 allowlist) → `commitMutations`;
  - `setLowBalanceAlerts` → the settings writer.
  
  Every one is dual-written as before.
- **Ghost mode:** amounts in sentences go through `useGhostMoney`.
- **Shared tap targets:** `lowBalanceUrl` moved into `lowBalanceDisplay.ts`, so the push and the app open the same screens. The push source re-exports it.
- Existing UI wrappers are reused: `Section`, `DataRow`, `RowGlyph`, `ChipRow`, `Chip` and `surfaces.wash`. No new UI framework.

## Tests
- `shared/utils/lowBalanceDisplay.test.ts` (7 tests):
  - short items in their window, largest first;
  - the viewer's day: yesterday's result still applies; past and not-yet-open items drop;
  - a result older than a day is ignored;
  - an untrusted balance shows as unverified;
  - picking one item, one card or one paying account;
  - the labels.

### Run locally
- UI, hooks, guards, push and app tests (35 files): **466/466**. This includes `listenersOff`, `providerSwitch` and `readModelWriteHooks`.
- `tsc --noEmit` and `typecheck:shared` are clean.

**Not run:** no screen was checked visually or on a device. The owner reviews UI on local Expo web with demo data.

## Review on local Expo web
Start from the worktree with `npx expo start --web --clear` (worktree Metro cache). To see banners, there must be a stored result:
- run `autodebit-daily` against the emulator (`FIRESTORE_EMULATOR_HOST`, Spendly Test); or
- write a `users/{uid}/serverResults/autoDebitShortfall` document in the emulator.

Check on phone width and desktop:
- the dashboard card;
- the recurring list badge and the item banner;
- the card and bank account banners;
- the card's Autopay section;
- the recurring form's lead-day chips;
- the Settings "Start warning" chips.
