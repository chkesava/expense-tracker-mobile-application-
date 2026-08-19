# Credit Card Bill Reminders — Phase 1 Audit

## Finding

This mobile repo has **no FCM / Expo Push token registration, no Cloud Functions, and no server-side notification scheduler**.

Existing notification surfaces:

1. **Local OS notifications** (`expo-notifications`) for SMS — immediate present only (`trigger: null`).
2. **In-app Firestore feed** for SIP at `users/{uid}/notifications`.

## Relevant files

| Area | Paths |
|------|--------|
| Local notifs | `services/sms/smsNotifications.ts`, `smsNotificationCopy.ts` |
| Tap routing | `providers/SmsReceiverProvider.tsx` (`data.source === "sms"`) |
| In-app feed | `hooks/useSips.ts`, `components/sip/SipNotificationsModal.tsx` |
| Timezone | `shared/types/settings.ts`, `providers/SettingsProvider.tsx` |
| Billing day | `shared/utils/billingCycle.ts`, `Account.billGenerationDay` |
| Credit kind | `shared/utils/accountKind.ts` |
| Bill pay | `AccountPayment`, `PayCreditBillModal.tsx`, `FinanceDataProvider.addPayment` |
| Cards UI | `components/accounts/CardsList.tsx`, `app/(app)/accounts/[id].tsx` |
| Ledger | `app/(app)/ledger.tsx`, `providers/LedgerStateProvider.tsx` |

## Architecture (current)

```
SMS → local expo-notifications (Android)
SIP execute → Firestore users/{uid}/notifications (in-app only)
No remote push · No cron for bills
```

## Integration points (chosen)

- Dedicated `users/{uid}/creditCardBills` (do not overload `Account`).
- Payments via existing **`AccountPayment`** (not `AccountTransfer` / not expense).
- Hybrid reminders: local scheduled `expo-notifications` + Firestore reminder logs; schema ready for future Expo Push + cron.
- Settings: `creditCardBillReminders` prefs + `timezone` + quiet hours.
- Separate Android channel `credit-card-bills`.

## Risks

1. Local-only delivery until a future server push path exists.
2. Billing helpers historically use device local dates — reminder math must use `settings.timezone`.
3. `firestore.rules` not in this repo — document required rules separately.
4. SMS tap handler is source-filtered; bill taps need a parallel `source`.

## Proposed reminder architecture

See feature plan: Bill CRUD → status engine → local scheduler → cancel on PAID / remaining ≤ 0 / prefs off.