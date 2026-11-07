# SPENDLY-223: Push credentials and transport (Spendly)

**Ticket:** [SPENDLY-223](https://kesavach.atlassian.net/browse/SPENDLY-223) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md).
**Branch:** `feature/SPENDLY-223-push-credentials`, cut from the epic branch after the 691 merge.

## Outcome

- **Transport: Expo Push Service.** The decision, limits and fallback are recorded in [PUSH_CREDENTIALS.md](PUSH_CREDENTIALS.md).
- **Already in place, verified rather than changed:**
  - the EAS projectId is in `app.json` and is inherited by the Expense and combined builds;
  - the `expo-notifications` plugin is in the shared plugin list;
  - `google-services.json` names `com.example.expensetracker`;
  - the local test build swaps in the emulator-only services file, so it has no FCM.
- **New guard:** `lib/pushConfig.contract.test.ts` fails if any of those conditions changes, or if the `.gitignore` rules for service-account keys disappear.
- **No app code changed.** Rebuilding the app isn't needed for this story.

## Acceptance criteria (rescoped to Spendly on 2026-11-06)

| Criterion | State |
|---|---|
| Transport decision recorded, with fallback and limits | Done (PUSH_CREDENTIALS.md) |
| FCM v1 credentials configured in Expo for `com.example.expensetracker` | **Owner action.** Steps are in PUSH_CREDENTIALS.md §"One-time setup". |
| iOS bundle id + APNs | Deferred (D4: Android first) |
| Manual test push reaches a signed Expense build | Moved to SPENDLY-224, because a device token only exists once registration ships |
| Credentials never committed; where they live is documented | Done (doc + contract test) |
| Expense, combined and local test builds still configured correctly | Done (contract test) |

## Tests

- `npx vitest run lib/pushConfig.contract.test.ts lib/localTestMode.test.ts`: 22 passed.
