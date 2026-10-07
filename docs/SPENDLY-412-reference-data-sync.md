# SPENDLY-412: Optimize Reference Data Synchronization

## Objective

Reduce repeated reads for relatively stable reference/configuration collections: `categories`, `subscriptions`, `spaces`, `categorizationRules`, `categoryBudgets`, `financialGoals`. Part of the SPENDLY-406 Firestore Read Optimization epic.

## Starting point

SPENDLY-408 already verified `ExpenseReferenceDataProvider` is the single shared source for all six collections (no duplicate per-consumer listeners). SPENDLY-411 gave `categoryBudgets`/`financialGoals` on-demand ref-counted gating. So "share one source of truth" was already satisfied going in — this story's actual job was **read cadence and boundedness**: which of the remaining four collections truly need realtime sync, and whether queries are bounded.

## Findings

- All four collections are small and stable by the team's own measurements (`docs/FIRESTORE_READ_INVENTORY.md`): categories <50 docs, subscriptions <25, spaces <10, categorizationRules <30. None of the provider's queries had a `limit(...)`.
- `categorizationRules`' realtime sync wasn't even reaching its intended automatic consumer: the SMS auto-categorization pipeline (`services/sms/smsCategorizer.ts` via `smsParser.ts`/`smsAiFallback.ts`) expects rules in its context, but `components/settings/SmsAutomationSettings.tsx`'s manual scan path never passes them. Its only real consumers are foreground, interactive UI (`ExpenseForm` autosuggest, `MagicChatModal`, the rules-management screen) — none need sub-second sync.
- `spaces` has a similarly narrow, non-collaborative consumer set and is the smallest collection.
- `categories`/`subscriptions` stay realtime: read from the most pervasive, correctness-sensitive screens (`ExpenseList`/`ExpenseForm`), and `subscriptions` also drives the app-wide due-subscription auto-posting side effect in the same provider.
- Firestore's offline cache (`lib/firebase.ts`) is durable on web but memory-only on native (no IndexedDB in RN) — "cache-first hydration" only helps within a session on mobile, not across cold starts.
- Two direct reads bypass the provider already, uninstrumented: `lib/ensureCategoryHierarchy.ts` (runs once per login, migrates categories/categorizationRules/categoryBudgets/subscriptions) and `services/sms/smsRecurringSync.ts`'s `loadRemoteSubscriptions` (already cache-first via `hydratedSubscriptions`, only falls back to `getDocs` on a cache miss).

## Changes

1. **`providers/ExpenseReferenceDataProvider.tsx`**
   - `categorizationRules` and `spaces`: converted from `onSnapshot` to a one-shot `getDocs` fetch, still keyed on the existing `useLoadFailure` `attempt`/`retry` plumbing. Bounded with `limit(500)`/`limit(200)` respectively.
   - Added a bounded foreground-refresh: on `AppState` → `active`, refetch `spaces`/`categorizationRules` only if the last fetch is >5 minutes old (`FOREGROUND_REFRESH_MIN_INTERVAL_MS`), giving eventual cross-device sync without a read storm on quick app switches.
   - `categories`/`subscriptions`: stayed `onSnapshot`, gained defensive `limit(500)`/`limit(200)` bounds.
2. **`hooks/useCategorizationRules.ts`, `hooks/useSpaces.ts`** — call the existing `retryRules()`/`retrySpaces()` after each write (`addRule`/`deleteRule`; `createSpace`/`updateSpace`/`deleteSpace`) so the shared state reflects a local change immediately instead of waiting for the next foreground-refresh window. Accepted trade-off: an add/delete now costs one extra read round-trip (typically well under a second) instead of an instant realtime push — reasonable for these low-frequency settings actions, not the financial ledger.
3. **`lib/ensureCategoryHierarchy.ts`** — added `logDirectRead` after its four `getDocs` calls (categories ×2, categoryBudgets/categorizationRules shared helper, subscriptions). Pure instrumentation, no behavior change.
4. **`services/sms/smsRecurringSync.ts`** — added `logDirectRead` to `loadRemoteSubscriptions`'s cache-miss fallback `getDocs`. Pure instrumentation.
5. **`lib/featureScopedProviders.test.ts`** — added tests for the foreground-refresh throttle logic (within-window → no refetch, past-window → refetch, never-fetched → treated as stale).
6. **Docs** — `docs/FIRESTORE_READ_INVENTORY.md` table and roadmap updated; `docs/SPENDLY-406-firestore-read-optimization.md` tracker updated on merge.

## Verification

- `npm test` — 364 files / 5442 tests passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` — clean.
- `git diff --stat` against the epic branch — touches exactly `providers/ExpenseReferenceDataProvider.tsx`, `hooks/useCategorizationRules.ts`, `hooks/useSpaces.ts`, `lib/ensureCategoryHierarchy.ts`, `services/sms/smsRecurringSync.ts`, `lib/featureScopedProviders.test.ts`, plus docs.
- Manual/emulator check (Spendly Test): add/delete a categorization rule and a space from Settings, confirm the change appears in `ExpenseForm`'s picker; confirm no continuous `firestore_listener_start` for `spaces`/`categorizationRules`, only one `logDirectRead` per session/refresh — still pending.

## Left alone, and why

- `categories`/`subscriptions` stay realtime — pervasive, correctness-sensitive consumers and (`subscriptions`) the auto-posting side effect.
- `categoryBudgets`/`financialGoals` — already handled by SPENDLY-411's on-demand gating; not re-touched here.
- No optimistic local-state patching on write — refetch-after-write is simpler and matches these collections' low stakes.
- No ref-counted mount-gating (SPENDLY-401/411 style) added to `spaces`/`categorizationRules` — their consumers (`ExpenseForm`, `ExpenseList`, Settings) are pervasive enough that gating would rarely skip the fetch; the one-shot conversion is where the actual read-volume win is.
