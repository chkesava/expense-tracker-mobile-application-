# SPENDLY-588 — Firestore read call sites (Expense product)

Companion to `docs/SPENDLY-588-read-inventory.md`. Derived from code on `main` `ac108974`, 2026-10-31. Ganesh and Nutrition are excluded. Every read below now goes through the read meter (`lib/firestoreReadMeter.ts`) via `@/lib/firestore`.

**Mount classes:**
- **LAUNCH:** every signed-in cold start.
- **DASH:** the dashboard (the default home route).
- **SCREEN:** only while a screen is open.
- **WRITE:** inside a save, delete or repair flow.
- **OTHER:** sign-up and public routes.

**Ref-counted listeners** (`borrowings`, `receivables`, `creditCardBills`, `financialGoals`, `categoryBudgets`) detach 15 s after their last subscriber.

## LAUNCH

| file:line | Path | Kind | Bound | When |
|---|---|---|---|---|
| providers/SystemSettingsProvider.tsx:81 | system_settings/global | listener (doc) | — | root, also signed out |
| providers/UserDocProvider.tsx:75 | users/{uid} | listener (doc) | — | root |
| hooks/useAppUpdate.ts:105 | system_settings/latest_release_expense | listener (doc) | — | root, Android |
| lib/ensureCategoryHierarchy.ts:67 | users/{uid}/meta/categories | getDoc | — | idle, every launch |
| lib/ensureCategoryHierarchy.ts:84, 257 | users/{uid}/categories | getDocs | unbounded | stale stamp only |
| lib/ensureCategoryHierarchy.ts:310 | users/{uid}/expenses | getDocs | **unbounded** | stale stamp only |
| lib/ensureCategoryHierarchy.ts:340 | users/{uid}/categoryBudgets, categorizationRules | getDocs | unbounded | stale stamp only |
| lib/ensureCategoryHierarchy.ts:370, 394, 421 | subscriptions, trips, users/{uid} | getDocs/getDoc | unbounded | stale stamp only |
| lib/commitMutations.ts:206 | users/{uid}/meta/outboxAck_* | getDoc | one per pending entry | outbox replay at sign-in |
| providers/FinanceDataProvider.tsx:678 | users/{uid}/expenses | listener | newest 300 | shell, immediate |
| providers/FinanceDataProvider.tsx:692 | users/{uid}/incomes | listener | newest 300 | shell, immediate |
| providers/FinanceDataProvider.tsx:709 | users/{uid}/accounts | listener | unbounded | shell, immediate |
| providers/FinanceDataProvider.tsx:743 | users/{uid}/accountTypes | listener | unbounded | shell, immediate |
| providers/FinanceDataProvider.tsx:808, 834, 860 | accountPayments, accountEntries, accountTransfers | listener | unbounded | shell, idle |
| providers/ExpenseReferenceDataProvider.tsx:265 | users/{uid}/categories | listener | 500 | shell, idle |
| providers/ExpenseReferenceDataProvider.tsx:312 | users/{uid}/subscriptions | listener | 200 | shell, immediate |
| providers/ExpenseReferenceDataProvider.tsx:372 | users/{uid}/spaces | getDocs | 200 | idle, plus foreground after 5 min |
| providers/ExpenseReferenceDataProvider.tsx:425 | users/{uid}/categorizationRules | getDocs | 500 | idle, plus foreground after 5 min |
| providers/BorrowingsReceivablesProvider.tsx:319, 350 | borrowings, borrowingRepayments | listener | unbounded | ref-counted; RemindersInbox, idle |
| providers/BorrowingsReceivablesProvider.tsx:410, 442 | receivables, receivableRepayments | listener | unbounded | ref-counted; RemindersInbox, idle |
| providers/CreditCardBillsProvider.tsx:262 | users/{uid}/creditCardBills | listener | unbounded | ref-counted; RemindersInbox, idle |
| providers/ExpenseReferenceDataProvider.tsx:545 | users/{uid}/financialGoals | listener | unbounded | ref-counted; launch only with the Save Goals flag |
| hooks/useCalendarReminders.ts:30 | users/{uid}/calendarReminders | listener | unbounded | **twice**: CalendarNotificationSync (immediate) + RemindersInbox (idle) |
| services/recurring/recurringDismissals.ts:19 | users/{uid}/recurringDismissals | getDocs | unbounded | after the ledger page is complete; re-runs on change |

## DASH

| file:line | Path | Kind | Bound |
|---|---|---|---|
| hooks/useDashboardCashFlow.ts:88 | financialSummaries `dashboard_*` | listener | 6 months (2 in `cashFlow=supabase`) |
| hooks/useDashboardCashFlow.ts:25 | financialSummaries | getDocs | older months, `cashFlow=supabase` fallback only |
| hooks/useDomainSummaries.ts:25 | financialSummaries/epf | listener (doc) | — |
| hooks/useNetWorthHistory.ts:40 | netWorthHistory | listener | 12 months |
| hooks/useGamification.ts:42 | stats/summary | listener (doc) | only if the card is enabled |
| services/merchant/merchantOverrideStore.ts:21 | merchantOverrides | getDocs | unbounded |
| providers/ExpenseReferenceDataProvider.tsx:496 | categoryBudgets | listener | **unbounded** |
| hooks/useInvestments.ts:54 | investments | listener | unbounded, idle |
| hooks/usePortfolio.ts:130, 137, 150 | portfolioSettings/config, holdings, investmentCashTransactions | listener | unbounded, idle |

## SCREEN

| file:line | Path | Screen |
|---|---|---|
| hooks/usePortfolio.ts:171–191 | portfolioTransactions, watchlist, portfolioOrders, alerts, portfolioSnapshots | Investments → Stocks |
| hooks/useSips.ts:59–76 | sipPlans, virtualPositions, sipTransactions, notifications | Investments → SIP |
| hooks/useSipPlans.ts:33 | sipPlans | Calendar, Runway, Goals Optimizer |
| hooks/useEpf.ts:116, 159, 602 | epfProfile/main, epfEstablishments, epfEstablishments/{id} | EPF tab, `epf/[establishmentId]`, Calendar |
| hooks/useEpfAllContributions.ts:52; useEpfContributions.ts:113 | epfContributions | EPF tab, establishment, Calendar |
| hooks/useEpfInterest.ts:101, 128; useEpfTransfers.ts:87; useEpfWageHistory.ts:58 | epfInterestEntries, epfReconciliations, epfTransfers, epfWageHistory | EPF |
| hooks/useDecisions.ts:31 | decisions | decisions, Calendar |
| hooks/useFeeReviews.ts:36; useFeeSignals.ts:42 | feeReviews, feeSignalDismissals | Insights, fees, transaction detail, Calendar |
| hooks/useGoalFundingPlans.ts:29 | goalFundingPlans | goals optimizer |
| hooks/useGoalHistory.ts:103, 187; services/goals/goalStore.ts:71; lib/readModel/goalSources.ts:98 | goalEvents | goal detail, analytics |
| hooks/useWhatIfScenarios.ts:33 | whatIfScenarios | what-if, optimizer |
| hooks/useRunwaySettings.ts:29; useRunwayOverrides.ts:33 | runwaySettings/default, runwayOverrides | Runway, Calendar, account detail |
| hooks/useLedgerEvents.ts:168, 265 | ledgerEvents | Ledger audit, transaction detail |
| lib/readModel/journalHistorySource.ts:44 | expenses / incomes | Journal older pages (50) |
| lib/readModel/journalMonthSource.ts:43 | expenses / incomes | month loads (ledger, drilldowns) |
| lib/summaryMonthStore.ts:160 | financialSummaries/dashboard_{month} | spending, budgets, trends |
| hooks/usePaymentRequests.ts:63 | paymentRequests (top-level) | Vaults → Collect |
| hooks/useSplits.ts:316, 325; useSplitShareClaims.ts:82 | splits, splitShareClaims | Vaults → Splits |
| hooks/useTrips.ts:48 | trips | Vaults → Travel |
| services/accounts/accountNotesStore.ts:48; accountDocumentsStore.ts:58 | accountNotes, accountDocuments | account detail, transaction detail |

## WRITE (reads inside write flows)

These are guards, idempotency checks and repairs. The main ones:
- `FinanceDataProvider` `deleteAccount` (7 linked-record queries), cashback and entry/transfer deletes.
- Borrowings/receivables deletes.
- Category rename/merge.
- `services/ledger/fetchAccountTypes.ts` (server fallback after a cache miss, on every balance-op write).
- `mutateLedgerTransaction` row load.
- The manual summary rebuild (`rebuildFinancialSummaries`, 10 queries, several unbounded).
- Portfolio buy/sell/cash.
- SIP execute.
- Bill payment void/edit.

## OTHER

| file:line | Read | When |
|---|---|---|
| providers/AuthProvider.tsx:214; lib/googleSignupGate.ts:17 | system_settings/global | sign-up |
| hooks/useAppUpdate.ts:37 | latest_release_expense | manual update check |
| lib/listenBySlug.ts:37, 51 | paymentRequests/{slug}, splitPublicShares | public share routes |
