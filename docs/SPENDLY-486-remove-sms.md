# SPENDLY-486: Remove the SMS auto-fetch feature

The SMS auto-fetch feature (reading bank SMS, auto-adding transactions, and the review inbox) was never used. This story removes it to make the app smaller and cut work done at runtime. It also drops the `READ_SMS` and `RECEIVE_SMS` permissions.

## Removed

### Native code and permissions
- The `modules/sms-reader` native module. It was autolinked through `expo.autolinking.nativeModulesDir`.
- `READ_SMS` and `RECEIVE_SMS` from `app.json` and `products/expense.json`. The untracked `android/` manifest was patched by hand. `prebuild --clean` regenerates it from config.

### Services and app shell
- `services/sms/*`: the parser, detector, pipeline, auto-add, dedupe, review inbox, notifications, AI fallback, permissions, listener, and match audit.
- `providers/SmsReceiverProvider`, `hooks/useSmsPermission` and `hooks/useSmsReviewInbox`.

### Screens and UI
- The `/sms-inbox` screen and its registrations: the Stack.Screen, `SUB_SCREEN_ROUTES` and `RESTORABLE_ROUTES`.
- The dashboard "Transaction inbox" banner.
- The app-bar bell. It only ever opened the SMS inbox.
- `SmsAutomationSettings` in Settings → Automation.
- The account "Use for SMS matching" switch, its warnings (`SmsMatchingUnconfiguredText`) and the card-list SMS warning.

### Shared code and data
- `shared/utils/accountResolver`, `shared/data/institutionMatch`, `shared/types/smsTransaction` and `shared/utils/displayCurrency`. The last one was only read by SMS notification copy.
- The SMS-only helpers in `accountIdentity`: `defaultSmsMatchingEnabled`, `requiresSmsLast4`, `smsMatching*Label`, `toAccountIdentity`, `accountMatchesSmsHint`, and the SMS-readiness status/report.
- The `smsSenders` and `smsKeywords` fields in the institution catalog.

### Readers of old SMS fields
- The "Recorded from: Bank SMS" detail row.
- The `duplicate_sms_fingerprint` ledger-audit check.
- The `smsImport` related record.
- The SMS fields in ledger-event snapshots and their diff labels.

## Moved (kept working)

### Recurring and subscription suggestions
These scan the whole expense list, not SMS, so they stay.

- They moved from `services/sms/smsRecurring*` and `smsMerchantNormalizer` to `services/recurring/`.
- `hooks/useSmsRecurringSync` became `hooks/useRecurringSync`.
- The AsyncStorage keys keep their `vault_sms_recurring_*` names, so existing suggestions and dismissals survive.
- The SMS-commit path, the occurrence log and the "recurring detected" local notification were dropped. That notification used the SMS channel. Suggestions still show under Subscriptions → Needs review.

### Notification tap routing
Taps on bill and calendar reminders, including a cold-start tap, moved from `SmsReceiverProvider` to `hooks/useNotificationTapRouting`, which is mounted in the Expense app shell. `"sms"` was removed from `NOTIFICATION_ROUTE_SOURCES`.

### Merchant data
- The merchant catalog moved to `shared/data/merchantCatalog`.
- The category rules moved to `shared/data/merchantCategoryRules`.
- Both are read by `merchantRegistry` and the recurring normalizer.

### Transaction inbox row
`TransactionInboxItem` moved to `components/creditCardBills/`, because statement reconcile uses it.

## Data
- **Firestore:** no migration. Old `sms*` fields stay on expense, income, account and ledger-event docs, and are simply no longer read or written.
  - Edits use `update` ops, so they leave those fields untouched.
  - Accounts no longer write `smsMatchingEnabled`.
- **Subscriptions:** `source: "sms"` stays as the stored value meaning "detected from repeating expenses". `subscriptionProcessor` and `runwayBaseline` still rely on it.
- **Device storage:** the SMS-only AsyncStorage keys (prefs, dedupe, inbound status, review inbox, occurrence log) are orphaned on devices. They are tiny and harmless.

## Not changed
- The `sms_alerts` bank-fee subtype in fee detection. It is a real bank fee, not this feature.
- The historical `docs/PHASE_*_SMS_*` docs, kept as history.
- Nutrition and Ganesh Seva, which never used SMS code.

## Tests
- `npm test`
- `npm run typecheck:shared`
- `npx tsc -p tsconfig.json --noEmit`
