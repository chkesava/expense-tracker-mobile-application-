# SPENDLY-591 — the remaining user collections in the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-591-sync-remaining` |
| Part A migration | `supabase-readmodel/supabase/migrations/20261102000000_readmodel_remaining.sql` |

591 comes in three parts on one branch:
- **A:** the flat collections (this section);
- **B:** the watchlist items, the first nested collection. It needs nested paths in the mapping, reader, push refs, `rm_client_apply` and purge;
- **C:** the `users/{uid}` settings document, which isn't a collection at all. It also needs a field allowlist, because security, PIN, duress and identity fields must never be copied.

## Part A — flat collections

| Table | Firestore | Typed columns (everything else stays in `doc`) |
|---|---|---|
| `category_budgets` | `categoryBudgets` | category, subcategory, amount, month, created |
| `decisions` | `decisions` | title, category, status, archived-from status, template id/version, review date, confidence, selected alternative, revision, created/updated/decided/closed (from the `*Ms` fields) |
| `calendar_reminders` | `calendarReminders` | title, category, recurrence, start/until date, `reminder_time` (from `time`), estimated amount, interval and remind-before days, created/updated |
| `fee_reviews` | `feeReviews` | source kind/id, decision, role, fee type, subtype, linked kind/id, source amount, inferred confidence (decimal), engine version, revision, created/updated |
| `fee_signal_dismissals` | `feeSignalDismissals` | kind, resolution, at |
| `merchant_overrides` | `merchantOverrides` | kind, ref key, merchant id, custom name, rejected, category, subcategory, created/updated |
| `recurring_dismissals` | `recurringDismissals` | merchant key, reason, dismissed at |
| `spaces` | `spaces` | name, description, color, icon, budget, start/end date, status, created/updated |
| `categorization_rules` | `categorizationRules` | keyword, category, subcategory, created |
| `trips` | `trips` | destination, trip name, start/end date **as text**, total budget, **stored** spent amount, status, created |
| `runway_settings` | `runwaySettings` (one doc, `default`) | mode, threshold kind/amount/months, window months, method, include unusual, projection months, updated |
| `runway_overrides` | `runwayOverrides` | kind, ref id, included, updated |
| `what_if_scenarios` | `whatIfScenarios` | name, version, engine version, duration months, archived, created/updated |
| `goal_funding_plans` | `goalFundingPlans` | name, mode, planned monthly, allow over-allocation, engine version, archived, created/updated |
| `sip_plans` | `sipPlans` | asset type, symbol, quote key, name, currency, frequency, status, amount, **stored** total invested/units, execution day/count, the four dates **as text**, skip next, created/updated |
| `sip_transactions` | `sipTransactions` | SIP id, date, asset, market price, amount, units, units/average after, status, created |
| `virtual_positions` | `virtualPositions` | asset, **stored** units, average price, total invested, updated |
| `net_worth_history` | `netWorthHistory` (one doc a month) | month, `history_schema_version` (from `schemaVersion`; the contract owns `schema_version`), created/updated. The daily points stay in `doc` |
| `watchlists` | `watchlists` (the list documents) | name, is default, imported legacy at, created/updated |

**Decisions:**
- **Trip and SIP plan dates are full ISO strings.** For example, `nextExecutionDate` is `toISOString()` of a local date. Cutting them to a UTC day would shift an IST date by one, so they are copied verbatim as `text`.
- **Arrays and maps stay in `doc`.** These are decision context and alternatives, reminder completions, What-If adjustments, funding inputs and net-worth points. Nothing is unnested or derived (R4.1).
- **`decisionEvents` isn't in the ticket**, so it isn't synced.

**Writers.** The guard now also recognises template paths (`` `users/${uid}/sipPlans` ``). It found these, all routed now:
- `hooks/useCategoryBudgets.ts`: add now uses a pre-made id (`doc(collection())` + `setDoc`, the same write as `addDoc`) so the path is known; delete is routed too;
- `hooks/useCategorizationRules.ts`: add, delete;
- `services/recurring/recurringDismissals.ts`;
- `hooks/useSips.ts`: create, toggle, delete, skip;
- `services/sip/executeSips.ts`: each execution batch, via `trackedBatch`.

Already covered:
- through `commitMutations`: decisions, reminders, fee reviews and dismissals, merchant overrides, runway, What-If, funding plans, net-worth history, watchlists;
- by the 671 hooks: spaces, trips;
- bulk migration: `lib/ensureCategoryHierarchy.ts` (allowed; it asks for a user sync).

**Server writers:** none. Account deletion removes the whole user tree.

**Tests:**
- the SQL tests: `assert_security` (51 policies), `rls_behaviour` (50 tables), `purge` (103 rows), `client_apply`, `golden.sql` regenerated;
- the mapping tests: verbatim trip/SIP dates, SIP decimals, ms timestamps, arrays kept in `doc`, `history_schema_version`;
- the push, sync-core and verify lists. Tests that used `trips` as their example of an unsynced collection now use `notifications`.

**Nightly read budget:** not in the 503 baseline. The `mode=full` dry run before the backfill reports it (R7.2).
