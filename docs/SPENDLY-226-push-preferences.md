# SPENDLY-226: Spendly notification preferences and one delivery window

**Ticket:** [SPENDLY-226](https://kesavach.atlassian.net/browse/SPENDLY-226) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md).
**Branch:** `feature/SPENDLY-226-push-preferences`, cut from the epic branch after the 224 merge.

## Decisions

- **No second switch for reminders that already have one.** The reminder categories reuse the existing switches. Only event types that had no switch get a new one.

  | Category | Switch |
  |---|---|
  | `bills` | `creditCardBillReminders.enabled` (plus each bill's own flag) |
  | `calendar` | `calendarNotifications.remindersEnabled` |
  | `dues` | `calendarNotifications.duesEnabled` (off by default, as today) |
  | `goals` | each goal's own reminder settings |
  | `investments` (SIP, EPF), `shared` (splits, vaults), `priceAlerts` | **new:** `pushNotifications.categories.*`, on by default |

- **No global push on/off switch.** Every category has its own switch, and the phone's own app notification setting already turns everything off. A third layer would add confusion, not control.
- **One delivery window.** `pushNotifications.deliveryWindow` replaces the separate bill and calendar quiet-hours controls.
  - Saving it also writes both older quiet-hours fields, so the existing local schedulers follow it unchanged.
  - Accounts that never saved one read the bill quiet hours, then the calendar's, then the default 08:00–21:00.
  - The helpers handle a window that crosses midnight (22:00–07:00) for the server engine (SPENDLY-692). The UI offers the same daytime choices as before.
- **Lock-screen amounts** (`showAmounts`) are **off** by default (decision D7 as recommended). The server copy reads this (231 onwards).
- **Android channels** (`PUSH_CHANNELS`): one per category.
  - The existing ids `credit-card-bills`, `financial-calendar` and `savings-goals` are kept, with the same importance.
  - New: `investments`, `shared-money`, `price-alerts`.
  - Dues share the calendar channel, because they live on the calendar card.
  - The channels are created before registration (`lib/pushChannels.ts`).

## What changed

| File | Change |
|---|---|
| `shared/utils/pushPreferences.ts` | Types and defaults; `parsePushNotificationSettings`; `resolveDeliveryWindow`; `isWithinDeliveryWindow` / `crossesMidnight`; `isPushCategoryEnabled` (for the sender, 227); `PUSH_CHANNELS`. |
| `shared/types/settings.ts` | `UserSettings.pushNotifications`, its default, its known key, and parsing (top-level or nested). |
| `providers/SettingsProvider.tsx` | `setPushNotifications` and `setDeliveryWindow`. The latter is one save that keeps the bill and calendar quiet hours in step. |
| `components/settings/PushNotificationSettings.tsx` | New **Notifications** card at the top of Settings → Automation: the delivery window, the three new categories, and lock-screen amounts. |
| `CreditCardBillReminderSettings.tsx`, `CalendarNotificationSettings.tsx` | Their quiet-hours controls are removed; each card now points to the Notifications window. |
| `lib/pushChannels.ts`, `hooks/usePushRegistration.ts` | The channels are created before registering. |
| `shared/utils/readModel/mapping.ts` | `pushNotifications` is added to the `user_settings` allowlist (`docKeys`). The settings write already calls `noteDirectWrites`. |

**Sync across devices:** preferences live on `users/{uid}`, so every device reads them through the existing settings listener, and the read model copies them in `user_settings`.

## Tests

- `shared/utils/pushPreferences.test.ts` (10): defaults and parsing, window resolution order, daytime and overnight windows, category switches, channel ids.
- `lib/pushChannels.test.ts` (3): one channel per id with the right importance, nothing off Android, ids equal to the scheduler constants.
- `shared/types/settings.test.ts`: `pushNotifications` defaults and stored values, top-level and nested.

## Not covered here

- **UI review:** the user checks it on local Expo web with demo data.
- **Sender use:** the server sender applying `isPushCategoryEnabled` and the window is SPENDLY-227 and 692.
- **Price alerts switch:** pushes for it only exist once SPENDLY-698 lands, which is blocked by 625. If 698 isn't done before the epic merges, hide the switch.
