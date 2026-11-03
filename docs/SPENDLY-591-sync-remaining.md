# SPENDLY-591 — the remaining user collections in the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-591-sync-remaining` |
| Part A migration | `supabase-readmodel/supabase/migrations/20261102000000_readmodel_remaining.sql` |
| Part B migration | `supabase-readmodel/supabase/migrations/20261102010000_readmodel_watchlist_items.sql` |
| Part C migration | `supabase-readmodel/supabase/migrations/20261102020000_readmodel_user_settings.sql` |

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

## Part B — watchlist items, the first nested collection

`users/{uid}/watchlists/{listId}/items/{itemId}` becomes the table `watchlist_items`:
- typed columns: `list_id`, symbol, Yahoo symbol, name, exchange, instrument type, `sort_order` (from `order`, a fractional rank; `ORDER` is reserved in SQL), created/updated.

**The key (a deviation from the ticket's suggested `(uid, list_id, doc_id)`).**
- A nested row's `doc_id` is `"{listId}/{itemId}"`. Firestore ids never contain `/`, so this is unambiguous and just as unique.
- The key stays `(uid, doc_id)`. So `rm_client_apply`, the version guard, tombstones, the purge and RLS work **unchanged**. That avoids a second, parallel key scheme in every write function.

**What learned the nested path:**
- **The mapping:** `TableSpec.parent = { collection: "watchlists", child: "items", column: "list_id" }`.
  - The spec's `collection` is the logical key `"watchlists/items"`, used for checkpoints, failures, counts and the push allowlist.
  - `firestorePathOf()` builds the real path.
  - `list_id` comes from the path, so it survives an unmapped row.
  - Parity compares it.
- **Push refs:** `users/{uid}/watchlists/{L}/items/{I}` becomes `{ collection: "watchlists/items", docId: "L/I" }`.
  - A nested ref needs exactly one `/`.
  - A flat ref still takes none.
  - Any other 6-part path (e.g. `meta/outbox/acks`) is refused.
- **The push server:** reads `firestorePathOf(...)`, and returns the ref's composite id, not the snapshot's bare id.
- **The client outbox:** unchanged. It builds entries from the push ref, so it gets the composite id and the real `source_path`. The RPC's `source_path` check (`users/{me}/…`) holds.
- **The sync reader:**
  - `scripts/lib/readmodelNestedPages.ts` pages every parent's children in turn, under one cursor.
  - Parents come from `listDocuments()`, so children whose list document was deleted are still copied (and tombstoned on full runs once they're gone).
  - Pages report their true read cost: the listing plus every child query, empty ones included. `Page.reads` feeds the run budget.
- **Verify:** counts the items across every parent.
- **The drill:** seeds and reads nested paths.

**Writers:** `services/portfolio/watchlistStore.ts` already writes through `commitMutations`, so the push and the client outbox both cover it.

**Tests:**
- push refs: nested paths, malformed nested ids, a flat ref with `/`;
- the mapper: composite key, `list_id`, real `source_path`, unmapped keeps `list_id`;
- the nested pager: across page boundaries, read cost, one listing per pass, no parents;
- the SQL tests:
  - `client_apply` (nested write, the same symbol in two lists, nested tombstone);
  - `purge` (a nested row goes with its owner: 106 rows);
  - 52 policies;
  - 51 tables.

## Part C — the `users/{uid}` settings document

The table `user_settings` holds one row per user, under `doc_id` `settings`, with `source_path` `users/{uid}`.

**An allowlist (`RootSpec.docKeys` in `mapping.ts`).** Only these fields are copied, into the typed columns and `doc` alike:
- currency, timezone, language, date/number format, first day of week;
- theme, theme mode, expense palette, accent colour, navigation style;
- default category/view, compact list, haptics, investments toggle;
- monthly budget (plus the legacy `monthly_budget`), export year;
- dashboard widgets/order, onboarding, card-bill reminders, calendar notifications.

**Never copied:**
- **PIN and lock:** `privacyPin`, `fakePin` (the duress PIN), `lockPastMonths`, `lockOnInactivity`, `inactivityTimeout`, `lockOnAppSwitch`, `ghostMode`;
- **Authorisation:** `role`;
- **Identity:** `username`, `avatar`, `email`, `displayName`, `photoURL`, `phone`, `upiId`.

Because it is an allowlist, any new field stays out until someone adds it.

**Legacy nested `settings` map:** flattened first, with top-level fields winning, as `mergeSettingsFromDoc` does. Its preferences come along; its PINs don't.

**Typed columns:** currency, timezone, language, theme, theme mode, expense palette, accent colour, navigation style, default view, monthly budget (money), investments toggle, compact list.

**Server-only:**
- The sync and the per-write push write it.
- It is on `readmodel_sync_table_ok` but **not** `readmodel_client_table_ok`, so `rm_client_apply` refuses it; `assert_security` and `client_apply` both check this.
- The client outbox never queues it.

**What learned the root document:**
- **The mapper:** `firestorePathOf` maps it to `users/{uid}`; `rootDocData` applies the flatten and the allowlist.
- **Push refs:** `users/{uid}` becomes `{ collection: "userSettings", docId: "settings" }`. A 4-part `users/{uid}/userSettings/...` path is refused, because the key is a label, not a sub-collection.
- **The reader:** one read per user per pass. Incremental passes compare Firestore's update time, because the document has no reliable `updatedAt`.
- **Verify:** counts 1 or 0.
- **The drill:** reads it.

**Writers:**
- `providers/SettingsProvider.tsx` and `theme/ThemeProvider.tsx` now call `noteDirectWrites(uid, ["users/{uid}"])`. The push is configured only in the Expense app (`FinanceDataProvider`), so it's a no-op in Ganesh and Nutrition.
- A new guard test requires a hook in every writer of `users/{uid}`. The exceptions write only uncopied fields, each with its reason:
  - PIN clears (`PrivacyPinProvider`);
  - username/avatar (`SetupWizardModal`);
  - profile identity (`ProfileSection`);
  - the bulk category migration (`ensureCategoryHierarchy`, which already asks for a user sync).

**Tests:**
- the mapper: every secret, PIN, role and identity value is absent from the row and `doc`; the legacy map is flattened; the budget string is coerced;
- push refs: root ref, duress refused, a 4-part path refused, a wrong doc id refused;
- outbox: root is never queued;
- guard: `users/{uid}` writers;
- the SQL tests:
  - 53 policies, 52 tables, purge 108;
  - `user_settings` on the sync allowlist only;
  - a client write to it is refused (42501).

## Coverage: screens to synced collections

Every screen-read collection from the 588 inventory is now synced, except:
- what the ticket rules out: Nutrition, Ganesh, duress, `meta/*`, shared `splits`/`vaults`/`paymentRequests`, and the security settings fields;
- `financialSummaries`, which is 592;
- audit trails no screen reads from the read model: `decisionEvents`, `holdingAdjustments`, `portfolioReconciliationAudits`.

## Results (whole story)

- `npm test`: 525 files, 7,415 tests; `tsc` and `typecheck:shared` pass. The changed scripts and functions typecheck on their own (scripts are outside `tsconfig.json`).
- **Read-model schema CI:** part A (run 41675273587) and part B (run 41677393456) both succeeded; part C is running. Docker Desktop was off, so the SQL suite ran in CI, not locally.

## Production (needs the user's approval)

1. **Three additive migrations:** `20261102000000`, `20261102010000`, `20261102020000`. Production dry run, then approval, then apply.
2. **Backfill:** the first nightly full run after the epic reaches main. `mode=full`, `dry_run=true` first, for the report and the read budget (these collections aren't in the 503 baseline). Then approval (R7.2).
3. **14 clean parity days.**

