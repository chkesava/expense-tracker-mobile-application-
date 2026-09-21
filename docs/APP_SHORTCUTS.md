# Spendly home-screen Quick Actions

Long-pressing the Spendly icon shows four native shortcuts (Android App Shortcuts, iOS Home Screen Quick Actions). They reuse existing add-modal and ledger routing — they do not save a transaction on their own.

## Current actions

| Id | Label | Destination |
|---|---|---|
| `expense.add` | Add Expense | Add Expense modal |
| `income.add` | Add Income | Add Income modal |
| `receipt.add` | Scan Receipt | Add Expense + receipt scanner |
| `accounts.open` | Accounts | `/ledger?tab=accounts` |

`qr.open` is not registered. Spendly has no scan-to-pay flow.

Ids are the routing keys. Never key off the display title.

## How a tap is applied

1. `expo-quick-actions` delivers the action (`QuickActions.initial` on cold start, `addListener` when the app is already running).
2. `lib/pendingAppShortcut.ts` stores `{ id, platform, launch }` until the Spendly shell is ready.
3. Last-route restoration stands down if a shortcut is pending (`shouldRestoreRoute.openedFromShortcut`).
4. After sign-in and PrivacyLock unlock, `useAppShortcutHandler` consumes the pending action once and:
   - opens `ModalProvider` for add/receipt, or
   - `router.replace`s the accounts ledger tab
5. Unknown ids and a stale `receipt.add` tap (AI off) fall back to the dashboard / Add Expense. Nothing is auto-saved.

Nutrition-only and Ganesh-only builds do not register these shortcuts. Combined (production) and expense-only builds do. Web is a no-op.

## How to add a fifth shortcut

1. Add a stable id to `APP_SHORTCUT_IDS` and a row in `SPENDLY_SHORTCUTS` in [`shared/config/appShortcuts.ts`](../shared/config/appShortcuts.ts).
2. Map it in `resolveShortcutAction` to an **existing** modal setter or route. Do not duplicate write logic here.
3. Copy the same id into `iosActions` in both [`app.json`](../app.json) (combined build) and [`products/expense.json`](../products/expense.json) `extraPlugins`. Do **not** add the plugin to nutrition/ganesh `SHARED_PLUGINS`.
4. If Android needs a distinct icon, add an `androidIcons` key and point `androidIcon` at it.
5. Extend [`shared/config/appShortcuts.test.ts`](../shared/config/appShortcuts.test.ts).
6. Rebuild native (`npx expo prebuild` then `npx expo run:android` / iOS). Expo Go and web do not show the long-press menu. Keep the menu at 3–5 items (Apple/Android recommend 4).

iOS static `iosActions` appear before the first launch. Android only shows shortcuts after JS runs `QuickActions.setItems`. On iOS, only call `setItems` when the dynamic list must drop an item (receipt hidden because AI is off); otherwise static actions stay as-is.

## Manual test (native rebuild required)

```
npx expo prebuild
npx expo run:android
```

iOS needs a Mac. Hot reload does not update the long-press menu.

1. Long-press Spendly → four short labels, no QR.
2. Cold start each action: correct modal or Accounts tab; form is empty until the user confirms.
3. Background the app and tap the same shortcut again: no duplicate sheets or stacks.
4. Sign out, tap a shortcut, sign in: the pending action applies after login.
5. Privacy lock on: unlock first, then the destination appears.
6. Disable AI features: Scan Receipt disappears after the next `setItems`; a leftover iOS item opens Add Expense.
7. A normal icon tap (no shortcut) still opens the usual default view.
