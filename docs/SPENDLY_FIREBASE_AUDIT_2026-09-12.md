# Spendly — Firebase security, realtime, data-integrity & architecture audit — 2026-09-12

Scope: the Spendly (expense) product of this Expo/React Native + Firebase monorepo, on
Android and Web, as of `30e478a` (branch `claude/spendly-firebase-audit-38088e`).
Ganesh Seva and Nutrition are out of scope except where they share infrastructure
with Spendly (auth, `lib/firebase.ts`, `firestore.rules`, the Firebase project
`expenseapp-27f94`, CI). Firebase remains the architecture; no backend migration is
proposed anywhere in this document.

Method. Full reconnaissance of `app/`, `providers/`, `hooks/`, `services/`, `lib/`,
`shared/`, `firestore.rules`, `firestore.indexes.json`, `netlify/`, `functions/`,
`.github/workflows/`, then five parallel deep-dives (rules + auth/exposure/offline,
listener census, financial write paths, investments/EPF, architecture/perf/tests),
each spot-checked against source before being recorded here. Every rules finding
was **executed against the real rules engine** in the Firestore emulator with a
21-case probe (all 21 behaved as predicted); the existing suite (`npm run
test:rules`, 8 files / 174 tests) and the unit suite (`npm test`, 185 files / 2,180
tests) both pass at this commit, and `npm run typecheck` is clean.

Classification used throughout:

- **CONFIRMED** — reproduced (emulator) or unambiguous in source.
- **LIKELY** — follows from documented SDK/platform behaviour or from code, not executed.
- **RECOMMENDATION** — architectural; not a defect on its own.

Every finding has a Jira ticket in project KAN (labels `spendly`, `audit-2026-09`,
area, `sev-*`). The mapping is in Appendix 1.

---

## A. Executive summary — top 10

| # | Finding | Severity | Ticket |
|---|---|---|---|
| 1 | **Any signed-in account can write `system_settings/global`** — the project-wide maintenance kill switch, signup gate, announcement banner, currency and feature flags. Proved in the emulator. Root cause: onboarding stores a per-user currency in the global doc. | CRITICAL | KAN-79 |
| 2 | **`users/{uid}.role` is client-writable** → self-assign `SUPER_ADMIN`, which bypasses the maintenance gate. Combined with #1 an attacker locks everyone else out and keeps access. | HIGH | KAN-80 |
| 3 | **Shared-data rules trust the UI**: any vault member can delete the vault or others' expenses; any split participant can settle/zero/delete the split; `paymentRequests` and `splitPublicShares` are anonymously enumerable (names + UPI IDs) and `createdBy` is reassignable. | HIGH | KAN-81, 82, 83 |
| 4 | **Native offline persistence is memory-only.** The Firebase JS SDK's `persistentLocalCache` needs IndexedDB; React Native has none, and the installed RN bundle contains the "Falling back to memory cache" path. `commitWrite` still tells the user "saved — offline, will sync" after 1.5 s, so a force-stop loses the write. | HIGH | KAN-112 |
| 5 | **Multi-step financial writes are not atomic**: Demat↔bank transfer (two ledgers, two commits), credit-card bill payment (payment doc, then stale read-modify-write of `amountPaid`; deleting a payment never reverses the bill). | HIGH | KAN-87, 88 |
| 6 | **System-generated writes are not idempotent across devices**: auto credit-card statements, subscription/EMI posts, SMS imports all use random ids and a local-snapshot guard → duplicates on two devices / reinstall; one subscription without an account aborts the whole run. | HIGH | KAN-89, 90, 91 |
| 7 | **EPF read path drops the lifecycle fields** (`expectedCreditTo`, `creditedAmount`, `reconciledAt`…): client catch-up is inert, reconciled months show as projected, balances/interest are overstated. Backfill save rewrites any month's status with no transition check; scheduler backfills years of simulated months at today's wage. | HIGH | KAN-100, 101, 102 |
| 8 | **35 live Firestore listeners on the dashboard**, 9 duplicates, 21 on unbounded collections; the full 8-listener portfolio set is held open from the app shell by a closed modal; `expenses` has no `limit`/window (the documented `limit(200)` staging was removed). | HIGH | KAN-105, 106, 107 |
| 9 | **Gemini API key inlined into every product bundle** (incl. Spendly APK and the public web build) and called from the client; no App Check anywhere. | HIGH | KAN-109, 84 |
| 10 | **Logout leaves the previous user's ledger in web IndexedDB**; privacy lock is an unsalted 4-digit SHA-256 in Firestore with a restart-resettable lockout; duress mode reveals itself in Settings. | HIGH/MED | KAN-110, 111 |

Cross-cutting: rules are deployed manually and CI never deploys them (KAN-85);
there is no crash reporting in any build (KAN-118); no negative rules tests exist
for the collections above and one test asserts the vulnerability in #1 (KAN-119).

---

## B. Security findings

| ID | Sev | Location | Problem | Attack scenario | Impact | Fix | Effort | Ticket |
|---|---|---|---|---|---|---|---|---|
| SEC-01 | CRIT | `firestore.rules:241-259`; `SystemSettingsProvider.tsx`; `SetupWizardModal.tsx:176` | `allow write: if signedIn() && docId=="global"` | Any account sets `maintenanceMode/disableSignups/announcementBanner/enableInvestments/defaultCurrency` | Project-wide DoS + phishing banner across 3 products | `write: if false`; move currency seed to `users/{uid}`; flip the test | S | KAN-79 |
| SEC-02 | HIGH | `firestore.rules:42-43`; `UserDocProvider.tsx:97-109`; `_layout.tsx:164` | `users/{uid}` write is field-agnostic | `setDoc(users/me,{role:"SUPER_ADMIN"})` | Maintenance bypass; privilege field trusted by sibling web app | Deny `role` in `affectedKeys()`; use custom claims | S | KAN-80 |
| SEC-03 | HIGH | `firestore.rules:65-96`; `useVaults.ts:155` | `allow read, delete: if isVaultMember()`; expenses `write` for any member | Member deletes vault / rewrites others' expenses; attacker creates vault naming victim | Shared financial history destroyed/falsified | Owner-only delete; `paidBy == uid` on expenses; validate `memberIds` | M | KAN-81 |
| SEC-04 | HIGH | `firestore.rules:98-120`; `shared/types/split.ts` | Participant `update` pins only `createdBy/participantIds` | Debtor sets `settled:true`, rewrites `participants[]`, deletes split | Debt erased; organizer's `accountEntries` links desync | Creator-only delete/update; participants via `splitShareClaims` | M | KAN-82 |
| SEC-05 | HIGH | `firestore.rules:123-141`; `usePublicPaymentRequest.ts:62` | `allow read: if true` (= list); `createdBy` not pinned on update | Anonymous dump of names/UPI/amounts; plant request in victim's list | Payment fraud material at scale | Slug-as-doc-id + `get`-only; pin `createdBy`; backfill | M | KAN-83 |
| SEC-06 | MED | `firestore.rules:57-58`; no `initializeAppCheck` | Recursive owner grant with zero schema validation; no App Check | Owner writes `amount:-1e12`, 500 KB blobs, arbitrary collections; forges `dateJoined` the cron trusts | Self-inflicted corruption; invariants unenforced; cost | Per-collection validation, incrementally; App Check | L | KAN-84 |
| SEC-07 | MED | `docs/FIREBASE_RULES_DEPLOY.md`; workflows | Rules/indexes deployed by hand; warnings non-fatal; indexes file is a subset of live | Fixed rules sit undeployed; deploy deletes live indexes | Drift; past outage class | CI deploy job; fail on `[W]`; index diff | S–M | KAN-85 |
| SEC-08 | MED | `SystemSettingsProvider.tsx:51-76` | Subscribes above `AuthProvider` with deps `[]`; permission-denied kills listener | Cold start signed out → login → flags stay default all session | Kill switch/signup gate ineffective | Subscribe after `authLoading`, resubscribe on uid | S | KAN-86 |
| AUTH-01 | HIGH | `lib/env.ts:28`; `nutritionAiService.ts:76`; all release workflows | Gemini key in every bundle; direct client call | `strings app.apk \| grep AIza` | Billing abuse | Rotate; proxy via Netlify fn with ID-token check; nutrition-only module | S–M | KAN-109 |
| AUTH-02 | MED | `lib/apkUpdate.ts:49-66,114-185`; `appRelease.ts:82` | `sha256`/`contentLength` published by CI but never verified; no https/host allowlist | Repo-write or CI compromise swaps APK; corrupted download installed | Limited by Android signature check | Verify hash; allowlist hosts | S | KAN-120 |
| AUTH-03 | HIGH | `AuthProvider.tsx:240-255`; `lib/firebase.ts:69-73` | No `terminate/clearIndexedDbPersistence/waitForPendingWrites` | Shared PC: next user reads IndexedDB ledger; logout drops pending writes | Data exposure; silent loss | Clear persistence on logout; pending-write guard | S | KAN-110 |
| AUTH-04 | MED | `pinSecurity.ts:14`; `privacySession.ts:17,82`; `PrivacyLock.tsx:247`; `PrivacySection.tsx:171-190` | Unsalted SHA-256 of 4 digits in Firestore; in-memory lockout; overlay over hydrated data; duress leaks in Settings | Restart to reset lockout; coercer reads "Remove duress PIN" | Privacy lock is UX only | Device-local salted PIN; persisted lockout; hide Privacy section in duress | M | KAN-111 |
| AUTH-05 | HIGH | `lib/firebase.ts:79-93`; `firestoreWrite.ts:25,98-118`; `@firebase/firestore` RN bundle | JS SDK persistence needs IndexedDB → memory cache on RN | Offline write → "saved" → force-stop → gone | Financial data loss; every cold start re-reads full ledger | RN Firebase SDK, or honest UX, or durable outbox | S–L | KAN-112 |
| AUTH-06 | MED | Settings sections; `googleAuthBridge.ts:51-54` | No account deletion; no re-auth; dead bridge with open `redirect_uri` | Token exfil if legacy page still live | Play policy gap; token theft | Admin-SDK deletion flow; delete bridge | M | KAN-113 |
| WEB-01 | MED | `scripts/build-web.js:161-194`; `netlify.toml:3-11` | Live build: catch-all redirect, no CSP/HSTS/nosniff/X-Robots; hardened toml superseded | XSS → full Firestore as user; app shell on share host | Weak web hardening | Emit headers in build script; decide on catch-all | S | KAN-117 |

### Firebase client exposure summary

| Item | In bundle? | Verdict |
|---|---|---|
| Firebase web API key / `google-services.json` | Yes, committed (public repo) | Expected for Firebase; add key restrictions + App Check |
| Google OAuth web client id | Yes | Not secret |
| Supabase publishable key | Yes | Intended (Ganesh) |
| **Gemini API key** | **Yes — real secret** | Rotate + proxy (KAN-109) |
| Service account / keystore / `EPF_CRON_SECRET` / `CRON_SECRET` | No | Correctly confined to GitHub/Netlify secrets |
| App Check | Absent | Recommend (KAN-84) |

---

## C. Realtime performance findings

Dashboard listener set (default settings): 3 root + 18 shell providers + 9 from
`GlobalAddModals` + 4 `NetWorthWidget` + 1 gamification = **35 Firestore listeners**,
9 duplicates, 21 on unbounded/append-only collections. Cleanup is correct
everywhere (no leaks); the problems are multiplicity and scope.

| ID | Sev | Listener / query | Current behaviour | Potential reads | Problem | Recommended architecture | Expected improvement | Ticket |
|---|---|---|---|---|---|---|---|---|
| RT-01 | HIGH | `usePortfolio()` ×8 + `useInvestments()` via `GlobalAddModals.tsx:16,28` → `TransferFundsModal.tsx:40` | Always-on from the app shell, modal closed, investments disabled or not | All `holdings`, `investmentCash`, `portfolioTransactions`, `portfolioSnapshots`… per session | Data never rendered on this path | Split mutation hook from data hook; mount modal on open; one lazy `PortfolioDataProvider` | −9 always-on, −13 on dashboard | KAN-105 |
| RT-02 | HIGH | `FinanceDataProvider.tsx:312,338,435,462,489` + repayments, bills, EPF, SIP, vault expenses | `orderBy(createdAt desc)` with **no `limit`** | Entire lifetime ledger on every cold start and every consumer memo | O(history) reads, memory, JS time; docs describe a removed `limit(200)` staging | Windowed realtime (current month ± 1) + paginated `getDocs` for history; on-demand for entries/payments/transfers | Bounded per-session reads | KAN-106 |
| RT-03 | MED | Portfolio tab ×4–6 copies; `useSplits` ×3 (6 listeners); `useTrips` ×3; `usePaymentRequests` per card (N+2); EPF ×2–3; release doc ×2 | Modals mounted with `visible` props; hooks called per component | Multiples of each collection | Duplicate reads and fan-out re-renders | Feature-scope providers; conditional modal mount; props to cards | Portfolio tab 32–48 → 8 | KAN-107 |
| RT-04 | LOW | All listeners | No `includeMetadataChanges`; `isFromCache` unused | — | Pending-sync banner stale; no "as of" indicator | Metadata on `expenses` only; show freshness | UX correctness | KAN-108 |
| RT-05 | MED | `CreditCardBillsProvider.tsx:556-568`; `ExpenseReferenceDataProvider.tsx:439-444`; `useGamification.ts:100` | Listener → write → listener feedback loops (auto bills, subscription posts, streak stats) | 1–N writes per snapshot per device | Every open device races to perform the same write | Deterministic ids (DI-03/04) + run on focus/daily, not per snapshot | Removes duplicate writes | KAN-89, 90 |
| RT-06 | MED | `SystemSettingsProvider.tsx:51-76` | Dies on permission-denied before auth; never resubscribes | — | Flags default for the session | Subscribe after auth | Correctness | KAN-86 |

---

## D. Firestore cost findings (ranked)

| Rank | Source | Type | Why it is the biggest | Ticket |
|---|---|---|---|---|
| 1 | Unbounded `expenses`/`incomes`/`accountEntries`/`accountPayments`/`accountTransfers` listeners, re-read every cold start (no real native cache — AUTH-05) | Reads | Linear in lifetime history × sessions × devices | KAN-106, 112 |
| 2 | Portfolio set always-on from the shell + duplicated 2–6× | Listener reads | 9–48 concurrent listeners on collections nobody on-screen reads | KAN-105, 107 |
| 3 | Write-on-read loops (auto bills, subscription posts, gamification `stats/summary`) on every device | Writes | Duplicate writes per device + re-triggered snapshots | KAN-89, 90 |
| 4 | Market quotes: one HTTP poll per holding per 60 s per mounted consumer | Network / Netlify fn invocations | Fan-out bounded only by React Query key dedupe | KAN-99 (noted) |
| 5 | `portfolioSnapshots` (1 doc/day, all loaded, 6 used) + `getDoc` per quote tick | Reads | Small today, grows forever | KAN-107 |
| 6 | EPF cron: 2 queries + ≤2 commits per current establishment monthly; processes `_duress` decoys | Reads/writes | Fine at current scale; unlogged failures | KAN-103 |
| 7 | Storage | Storage | Negligible — Spendly stores no files in Firebase Storage (APKs only, via CI) | — |

---

## E. Data-integrity findings

Source-of-truth model (good): bank/cash balances are **derived** (`computeBankBalance`)
from records; there is no `accounts.balance` to drift. Credit-card position is
derived by `buildCreditCardLedger`. Stored aggregates that **can** drift:
`creditCardBills.{amountPaid, remainingAmount, status, paymentIds}`,
`borrowings.{outstandingPrincipal, accruedInterest, totalOutstanding, status}`,
`receivables.{totalReceived, outstandingAmount, status}`, `trips.spentAmount`,
`splits.participants[].{paidAmount, paid}`, `subscriptions.lastProcessed`,
`portfolioSettings.cashBalance`, `holdings.{quantity, averageBuyPrice}`,
`sipPlans.{totalInvested,totalUnits}`, `epfInterestEntries`.

| ID | Operation | SOURCE → RECORD → DERIVED → UI | Atomic | Idempotent | Drift / destructive | Sev | Ticket |
|---|---|---|---|---|---|---|---|
| DI-01 | Demat ↔ bank transfer (`TransferFundsModal.tsx:99-146`) | cash ledger batch, **then** `accountEntries` addDoc | No | No | Half-applied → money created/destroyed | HIGH | KAN-87 |
| DI-02 | Bill payment (`PayCreditBillModal.tsx:153-235`, `CreditCardBillsProvider.tsx:623-644`) | `accountPayments` setDoc, then bill `amountPaid = existing + amount` | No | No (no `saving` guard at entry) | RMW on stale state; `deletePayment` never reverses; ledger re-credits dangling ids | HIGH | KAN-88 |
| DI-03 | Auto credit-card statement (`CreditCardBillsProvider.tsx:338-547`) | random-id `createBill` per draft | per doc | No (local-snapshot guard) | Duplicate statements across devices | HIGH | KAN-89 |
| DI-04 | Subscription/EMI post (`ExpenseReferenceDataProvider.tsx:362-444`) | random-id expense + `lastProcessed` in one batch | Yes | No across devices | Double charge; `undefined` accountId aborts run | HIGH | KAN-90 |
| DI-05 | SMS auto-add (`smsTransactionProcessor.ts:110-117`) | AsyncStorage dedupe (4000 keys) written **before** the Firestore write; no fingerprint on doc | n/a | Device-local only | Reinstall re-imports; crash loses SMS silently | HIGH | KAN-91 |
| DI-06 | Expense edit/delete (`ExpenseForm.tsx:409-419`, `ExpenseList.tsx:192-231`) | in-place `updateDoc` / hard `deleteDoc` | n/a | — | `trips.spentAmount` stale; no audit trail (Audit tab is a placeholder) | MED | KAN-92 |
| DI-07 | Split delete / mark collected (`useSplits.ts:1117-1156, 562-609`) | batch-deletes `accountEntries`; whole-array overwrite | Yes | No (local guard) | Retroactive balance change; orphan credit across devices | MED | KAN-93 |
| DI-08 | Wizard first expense (`SetupWizardModal.tsx:236-242`) | malformed doc (no `month`, `description`, UTC date) | n/a | — | Invisible to Insights; three month-filter variants | MED | KAN-94 |
| DI-09 | Money math / timezone | 5× `roundMoney`; unrounded inputs; device-local vs `settings.timezone` | — | — | Residue writes; wrong-month posts | LOW | KAN-95 |
| DI-10 | Borrowing/receivable repayment (`BorrowingsReceivablesProvider.tsx:451-488`) | child + recomputed parent in one batch | Yes | — | Parent LWW across devices; `updateBorrowing` skips recompute | LOW | KAN-96 |
| INV-01 | Mock buy/sell (`usePortfolio.ts:465-550`) | `runTransaction` on scalar `cashBalance`; ledger elsewhere | Yes (trade) | — | Two cash authorities; plain overwrite; negative qty only client-guarded | HIGH | KAN-97 |
| INV-02 | Holding delete+refund / CSV overwrite (`usePortfolio.ts:306-356`) | reverse entry then delete; delete-all + recreate | No | — | Wrong refund lot; orphaned PURCHASE links; limit orders never execute | MED | KAN-98 |
| INV-03 | SIP execute (`useSips.ts:244-385`) | random-id `sipTransactions`; `price \|\| 100` | per batch | No | Double execution; fabricated price; N+1; `endDate` ignored | MED | KAN-99 |
| EPF-01 | Contribution read (`contributions.ts:188-211`) | lifecycle fields dropped | — | — | Balances/interest overstated; catch-up inert | HIGH | KAN-100 |
| EPF-02 | Backfill save / delete (`EpfBackfillScreen.tsx`, `useEpfContributions.ts:199,419`) | status overwrite w/o `canTransition`; hard delete | — | — | Contradictory states; history destroyed | HIGH | KAN-101 |
| EPF-03 | Scheduler (`schedule.ts:98-113`) | backfills since `dateJoined` at current wage | — | ids deterministic | Years of simulated months auto-credited | HIGH | KAN-102 |
| EPF-04 | Cron (`epf-cron.ts`) | swallowed errors; unchunked batch; unconditional set-merge; UTC vs local | — | create-safe | Clobbers user edits; silent per-establishment failure | MED | KAN-103 |
| EPF-05 | Interest / reconciliation / transfer reversal | stale interest docs; auto-id observations; no precondition | — | No | Overstated balance; double variance | LOW | KAN-104 |

Never recommended here: deleting financial history as a correction. Every fix above is
a deterministic id, a single batch, a compensating/reversal record, or a soft-delete.

---

## F. Race-condition findings

| Scenario | Where | Outcome today | Ticket |
|---|---|---|---|
| Two devices pay the same card bill / double-tap | `applyPaymentToBill` RMW from React state | One stamp lost or double-counted | KAN-88 |
| Two devices open after statement close | `generateAutoBills` random ids | Two statement docs | KAN-89 |
| Two devices idle at subscription due time | `processDueSubscriptions` | Two expenses | KAN-90 |
| Two devices mark the same friend collected | `markParticipantCollected` array overwrite | Orphan bank credit | KAN-93 |
| Cron auto-credit vs user recording actual credit | `epf-cron.ts:200-209` set-merge | Row reset to `credited` with shortfall | KAN-103 |
| Two devices reconcile / reverse EPF transfer | auto-id observation; in-memory guard | Variance applied twice | KAN-104 |
| Ledger deposit concurrent with mock trade | scalar `cashBalance` overwritten in txn | Deposit lost | KAN-97 |
| Two SIP taps / devices | `triggerManualExecute` | Double execution | KAN-99 |
| Repayment on two devices | parent summary from local child list | Parent LWW | KAN-96 |

`runTransaction` is used only in `usePortfolio`, `useEpf`, `useEpfTransfers`
(`settleTransfer`) and the Ganesh functions; the decision to avoid it elsewhere for
offline-first reasons (`useSplits.ts:962-971`) is sound — the missing piece is
deterministic ids for every system-generated write.

---

## G. Offline / sync findings

Configuration (`lib/firebase.ts`): web = IndexedDB multi-tab persistent cache; native
= `persistentLocalCache` requested but **resolves to memory** (AUTH-05). Writes go
through `commitWrite` (1.5 s grace → `"queued"`); late failures are toast-only.

| Scenario | Safe? | Why | Ticket |
|---|---|---|---|
| Offline write → force-stop → reopen (Android) | **No** | Memory cache; mutation gone though user was told "saved" | KAN-112 |
| Offline write → logout | No | No pending-write check; SDK drops previous user's queue | KAN-110 |
| Logout on shared web browser | No | IndexedDB retains ledger | KAN-110 |
| Two devices edit `accounts/{id}` / settings | LWW at field level (`merge:true`) — acceptable | — | — |
| Two devices stamp bill / post subscription / create statement | No | See F | KAN-88/89/90 |
| Cache-served destructive cascades (`deleteAccount`, borrowing/receivable/space/trip delete) | **Yes** | Refuse when `metadata.fromCache` | — |
| Financial decision on cached balance | Mock trades: server-authoritative txn (good); bill "owed" cap uses local ledger (acceptable) | — | — |
| Pending-sync indicator | Stale | No `includeMetadataChanges` | KAN-108 |
| Late write failure after navigation | Toast only, unrecoverable | No persisted failure record | KAN-118 |

---

## H. Firebase security rules review

| Rule | Current security | Risk | Recommendation |
|---|---|---|---|
| `users/{uid}` (`:42-43`) — `read, write: if isOwner(uid)` | Owner-only, field-agnostic | `role` self-escalation; PIN hashes synced | Deny `role` changes; custom claims; move PIN off Firestore |
| `users/{uid}/{collection}/{document=**}` (`:57-58`) | Owner-only recursive grant, no schema | Self-inflicted corruption; server trusts client fields; unlimited docs | Per-collection validation for financial collections; App Check |
| `vaults/{id}` (`:65-96`) | Members read; **members delete**; ownership pinned on update | Non-owner destroys vault | Owner-only delete; per-expense ownership |
| `splits/{id}` (`:98-120`) | Participants read/**delete/update anything but ids** | Debt erasure | Creator-only mutation; claims for participants |
| `paymentRequests`, `splitPublicShares` (`:123-141`) | `read: if true` (list!), creator writes unpinned | Anonymous enumeration; `createdBy` reassignment | `get` only via slug id; pin `createdBy` |
| `splitShareClaims` (`:171-239`) | Anonymous create-only, deterministic id, `list: false`, parent re-read | **Good** — the model the others should follow | Keep |
| `system_settings/{docId}` (`:241-259`) | Pointers public-read (intended); **`global` writable by any signed-in user** | Project-wide DoS / defacement | `write: if false` |
| `storage.rules` | `releases/**` read signed-in, write false; everything else denied | Fine | Keep |
| Ganesh section (`:266+`) | Out of scope; note it shares the `users/{uid}/pandalMemberships` exclusion which the 09-07 audit already hardened | — | — |

Fundamentally unsafe today: the two `read: if true` collections and the writable
`global` doc. Everything else is "secure because the UI does not do it".

---

## I. Realtime architecture recommendation

| Category | Data | Why | Consistency trade-off |
|---|---|---|---|
| **REALTIME** (1 listener each, provider-level) | `users/{uid}` settings/role; `system_settings/global` (after auth); `accounts`, `accountTypes`, `categories`, `spaces`, `subscriptions`, `categoryBudgets`, `financialGoals`, `borrowings`, `receivables`, `creditCardBills`; shared `vaults`, `splits`, `paymentRequests` (one listener per collection at the Vaults scope) | Small, bounded, or genuinely multi-user | None beyond today |
| **REALTIME-WINDOWED** | `expenses`, `incomes`: current month ± 1 (or staged `limit`) | Dashboard/ledger must reflect SMS auto-add and multi-device edits now | Old-month edits from another device appear on refresh/focus |
| **NEAR-REALTIME** (refresh on focus/reconnect, 60 s staleTime via the existing React Query setup) | `holdings`, `portfolioSettings`, `investments`, `epfProfile`, `epfEstablishments`, `trips` — only while their tab is mounted | Screen-scoped; nobody reads them elsewhere | Lag ≤ one focus cycle |
| **ON-DEMAND / paginated `getDocs`** | `accountEntries`, `accountPayments`, `accountTransfers`, repayments, `investmentCash`, `portfolioTransactions`, `sipTransactions`, `epfContributions`, `epfInterestEntries`, `epfReconciliations`, `vaults/{id}/expenses`, `portfolioSnapshots`, `watchlist`, `portfolioOrders`, `alerts`, `notifications` | Append-only history; balances are the only live need | Balances lag ≤ one focus cycle unless a running balance is maintained |
| **CACHED / write-then-read** | `stats/summary` (gamification), `focus/active`, `latest_release_*` (`getDoc` on AppState active) | Single-writer or slow-moving | Minutes of latency is fine |

Not recommended: turning shared collections (vaults/splits/payment requests) into
polling — they are the one place realtime is product value. Recommended: one
provider per feature scope, mutation hooks separated from data hooks, and a
listener-count budget asserted in tests.

---

## J. Target architecture (Firebase, incremental)

```
UI  app/(app)/* screens · components/*
 │   no direct Firestore SDK calls (today: ExpenseForm, ExpenseList, SetupWizard, ProfileSection)
 ▼
State / providers  (React context, memoized & split)
 │   FinanceDataProvider (windowed expenses/incomes + accounts) · ExpenseReferenceDataProvider
 │   BorrowingsReceivablesProvider · CreditCardBillsProvider · VaultsScopeProvider (new)
 │   PortfolioDataProvider (new, lazy) · EpfProvider (new, lazy) · ModalProvider (memoized)
 ▼
Repositories / hooks  (reads: listeners or React Query getDocs; writes: mutations only)
 │   ledgerRepository (create/update/delete + revision record)   creditCardRepository
 │   portfolioMutations / portfolioData                          epfRepository
 ▼
Services  (pure + Firestore batch builders)
 │   services/ledger · services/portfolio/investmentCash · shared/utils/* (money, dates, ledgers)
 │   idempotency: deterministic ids for every system-generated write
 │   atomicity: one writeBatch per user action; runTransaction only for server-authoritative checks
 ▼
Firebase
     Auth (Google/email; custom claims for admin)
     Firestore  rules = boundary: per-collection validation, owner-only, creator-only shared writes,
                get-only public docs; App Check enforced
     Netlify functions (Admin SDK): epf-cron (logged, chunked, preconditioned), gemini-proxy (new),
                account-deletion (new); Cloud Functions remain Ganesh-only
```

Where the boundaries sit:

- **Security boundary** = `firestore.rules` + App Check + Admin-SDK functions. Never the UI.
- **Consistency boundary** = one `writeBatch` per user action; deterministic ids for system writes; compensating records instead of deletes.
- **Caching boundary** = provider level (windowed listeners) and React Query (focus-refreshed `getDocs`); a durable outbox (or the RN Firebase SDK) under `commitWrite` on native.
- **Sync indicator** = `syncStatusStore` fed by `includeMetadataChanges` on the expenses listener, plus persisted late-failure records.

---

## K. Prioritized fix plan

### PHASE 0 — Emergency security (days)
| Task | Ticket | Approach | Risk | Tests |
|---|---|---|---|---|
| Lock `system_settings/global`; move currency seed to user settings | KAN-79 | Rules `write: if false`; edit `SetupWizardModal.tsx:176`; flip `systemSettings.rules.test.ts:70-73` | Low | Emulator: any-user write denied; onboarding completes |
| Deny `role` writes | KAN-80 | `affectedKeys().hasAny(['role'])` guard | Low | Emulator negative case |
| Rotate Gemini key, restrict, proxy | KAN-109 | Netlify fn with ID-token check (pattern exists) | Nutrition AI downtime if rotated first | Manual |
| Deploy rules; add CI deploy job | KAN-85 | `firebase deploy --only firestore:rules` with scoped SA; fail on warnings | SA scoping | Post-deploy smoke |
| Vault/split/public-collection rules | KAN-81, 82, 83 | Owner/creator-only mutations; slug-as-id migration with fallback window | Migration | Emulator suite from the 21-case probe |

### PHASE 1 — Critical data integrity (1–2 weeks)
| Task | Ticket | Approach |
|---|---|---|
| Decide native persistence strategy and fix the "queued" promise | KAN-112 | Device verification first; then RN Firebase SDK **or** durable outbox **or** honest UX |
| Single-batch Demat↔bank transfer; `transferId` on both rows | KAN-87 | Pre-generate entry ref into the cash batch |
| Bill payment + stamp in one batch; absolute `amountPaid`; reversal on delete; submit guard | KAN-88 | `increment`/recompute inside batch |
| Deterministic ids: auto bills, subscription posts, SMS imports | KAN-89, 90, 91 | `${accountId}_${statementDate}`, `${subId}_${monthKey}`, `sms_${hash}`; persist dedupe keys after commit |
| EPF read path + backfill guard + scheduler bound | KAN-100, 101, 102 | Carry fields; `canTransition`; bound `monthsToGenerate`; call `isEligibleForAutomatedProcessing` |
| Portfolio cash single authority | KAN-97 | Ledger fold inside the transaction; `increment` for the cache |

### PHASE 2 — Realtime optimisation
KAN-105 (shell portfolio listeners), KAN-107 (duplicates → scope providers), KAN-86
(settings listener after auth), KAN-108 (metadata changes).

### PHASE 3 — Firestore query/read optimisation
KAN-106 (windowed expenses + paginated history; on-demand entries/payments/transfers),
KAN-99 (SIP N+1, chunking), KAN-114 (context memoisation, sort allocations, FlashList).

### PHASE 4 — Offline/sync improvements
KAN-110 (clear persistence on logout; pending-write guard), KAN-108 (freshness
indicator), KAN-118 (persist late-failure records), KAN-103 (cron preconditions/logging).

### PHASE 5 — Architecture cleanup
KAN-115 (ledger repository, single month/day helpers, dead code), KAN-92/93 (soft-delete
+ revisions + reversal records), KAN-98, KAN-104, KAN-95, KAN-96, KAN-94, KAN-116, KAN-117, KAN-111, KAN-113, KAN-120.

### PHASE 6 — Testing/observability
KAN-119 (negative rules suite from the probe, concurrency tests, listener budget, cron
tests, Maestro offline smoke), KAN-118 (crash reporting, read/write metering, perf
baseline), KAN-84 (App Check, per-collection validation — incremental).

---

## L. Quick wins (low risk, meaningful)

1. `allow write: if false` on `system_settings/global` + move the wizard's currency write to user settings (KAN-79).
2. Deny `role` in the `users/{uid}` update rule (KAN-80).
3. `allow delete` on vaults and splits only for owner/creator (KAN-81/82).
4. Pin `request.resource.data.createdBy == resource.data.createdBy` on `paymentRequests`/`splitPublicShares` (KAN-83, partial).
5. Split `usePortfolio` into mutation/data hooks; mount `TransferFundsModal` on open (KAN-105).
6. `useMemo` the four unmemoized context values (KAN-114).
7. `if (saving) return` at the top of `PayCreditBillModal.handleSubmit`; `omitUndefined` + per-action `try/catch` in `processDueSubscriptions` (KAN-88/90).
8. Deterministic ids for auto bills and subscription posts (KAN-89/90).
9. Carry the six EPF lifecycle fields through `normalizeEpfContribution` (KAN-100).
10. Subscribe `SystemSettingsProvider` after `authLoading` (KAN-86); log swallowed errors in `epf-cron.ts` (KAN-103).

---

## M. High-risk changes — do not do casually

- **Rules rewrites in one shot.** The 09-07 outage came from a one-token rules bug that only broke `list`. Land one collection at a time behind emulator tests and the CI gate; deploy deliberately.
- **Slug-as-id migration** for payment requests/shares: links in circulation must keep resolving; backfill with dry-run on the shared project (no staging).
- **Switching to `@react-native-firebase/firestore`**: changes the native build for all three products; test Ganesh/Nutrition too.
- **Windowing the `expenses` listener**: every month-total consumer must fall back to a fetch when the window does not cover the selected month; Insights/analytics use a different month predicate today.
- **Changing stored `amountPaid` semantics** on credit-card bills: touches the allocation engine; users' PAID/PARTIAL labels will move.
- **EPF fixes that change balances** (EPF-01/03): balances will drop for users with partial months or backfilled simulated years — announce it; never delete the simulated rows automatically.
- **Any backfill script** (month field, duplicate statements, slug ids): dry-run first, idempotent, never deletes.
- **Soft-delete rollout**: every list query and derived balance must filter `deletedAt`, or totals silently include deleted rows.

---

## N. Test plan

| Area | Tests to add | Where |
|---|---|---|
| Security rules | Convert the 21-case audit probe into `firestore/spendlySharedData.rules.test.ts` with assertions **inverted** after fixes: any-user `global` write denied; `role` write denied; member vault delete denied; participant split mutation denied; anon `list` denied / `get` by slug allowed; `createdBy` change denied; per-collection schema negatives (`amount < 0`, wrong types) | emulator job (exists) |
| Authentication | Cold start signed-out → login → `system_settings` honoured; logout clears IndexedDB (web) and blocks on pending writes; re-auth before PIN change | Playwright (web), Maestro (Android) |
| Authorization | Duress session cannot read real settings/profile; SUPER_ADMIN only via custom claim | unit + emulator |
| Firestore queries | Every listener has `limit` or window; index coverage for windowed queries; listener-count budget per screen (`listenerRegistry` counter) | provider tests with mocked SDK |
| Realtime listeners | Mount/unmount/retry per provider; duplicate-listener regression for portfolio/splits/trips/paymentRequests | hook tests (add testing-library + jsdom) |
| Offline mode | Airplane → write → kill → reopen → verify (device); `fromCache` guards on cascades; `commitWrite` late-failure persisted | Maestro + unit |
| Multi-device sync | Two emulator clients: bill stamp, statement generation, subscription post, mark-collected, EPF credit — assert single document / correct totals | emulator concurrency suite |
| Concurrent writes | Interleaved batches on the same doc; `increment` vs overwrite | emulator |
| Financial transactions | Demat↔bank half-failure leaves reconcilable state; bill payment + reversal; soft-delete excluded from balances | `lib/finance/*.integration.test.ts` extensions |
| Investment calculations | Fractional-quantity sell to zero; refund equals net outstanding; cash authority equals ledger fold | unit |
| EPF calculations | `normalizeEpfContribution` round-trip; `monthsToGenerate` bounded; interest recompute removes zero years; reconciliation idempotent per date | unit (exists partially) |
| Scheduler retries | Cron page re-run is a no-op; failed establishment counted; batch chunking at 401+ writes; precondition rejects clobber | Netlify fn tests with emulator |
| Duplicate events | Same SMS twice on two devices → one expense; same statement date twice → one doc | unit + emulator |
| Network failures | Quote fetch failure → SIP skipped (not ₹100); market API timeout → cost-basis fallback labelled | unit |
| App restart during writes | Outbox replay (if adopted) or honest UX copy assertion | Maestro |
| Timezone boundaries | Month keys at 23:30/00:30 IST vs UTC for subscriptions, EPF, bills; `settings.timezone` threaded | unit |

---

## SPENDLY SECURITY & REALTIME SCORECARD (0–10)

| Dimension | Score | Basis |
|---|---|---|
| Security | 4 | Per-user boundary solid; global doc, role, shared collections, public enumeration, secret in bundle |
| Firebase Rules | 4 | Personal tree correct; no validation; three fundamentally unsafe grants; manual deploy |
| Authentication | 6 | Standard Firebase Auth done properly; no re-auth, no deletion, persistence not cleared |
| Authorization | 3 | Shared-data mutation rights are UI-only; role self-assignable |
| Data Integrity | 5 | Derived bank balances and client-generated ids are right; stored aggregates drift; destructive edits |
| Financial Integrity | 4 | Non-atomic multi-ledger writes; non-idempotent system writes; EPF overstatement |
| Realtime Architecture | 4 | Clean teardown, but 35 listeners on the dashboard, 9 duplicates, shell-level portfolio set |
| Firestore Efficiency | 3 | Unbounded history listeners; write-on-read loops; no metering |
| Offline Reliability | 3 | Native persistence is memory-only while the UX promises durability |
| Multi-device Consistency | 4 | LWW on aggregates; local-snapshot idempotency guards |
| Mobile Performance | 6 | Idle-deferral, FlashList, memoized finance contexts; unmemoized modal context, O(history) recompute |
| Cost Efficiency | 4 | Linear-in-history reads per session; duplicate listeners |
| Observability | 2 | No crash reporting; console-only logging; cron swallows errors |
| Test Coverage | 6 | 2,180 unit + 174 emulator tests passing; zero hook/component/E2E/concurrency; one test asserts a vulnerability |
| Overall Architecture | 6 | Clear provider layer, shared pure utils, good write wrapper; repository layer missing, dead code, doc drift |

### TOP 5 THINGS TO FIX FIRST
1. `system_settings/global` writable by any user + `role` self-escalation (KAN-79, KAN-80) — then deploy the rules.
2. Gemini key rotation and proxy (KAN-109).
3. Native offline persistence reality vs the "saved — will sync" promise (KAN-112).
4. Shared-data rules: vault/split mutation rights and anonymous enumeration (KAN-81, 82, 83).
5. Atomic + idempotent financial writes: Demat transfer, bill payment, auto bills, subscription posts, SMS imports (KAN-87–91).

### TOP 5 THINGS ALREADY DONE WELL
1. Bank/cash balances are **derived** from records — no stored `accounts.balance` to drift; credit-card position derived by one well-documented function.
2. `commitWrite` + client-generated ids + `serverTimestamp` make single-document creates safe under retry, double-tap and (real) offline replay; cache-served destructive cascades are refused.
3. `splitShareClaims` is a textbook anonymous-write design: deterministic id, create-only, `list` denied, parent re-read in rules, effect applied atomically with claim deletion.
4. Rules are tested against the **real** engine in CI on every PR, and the 09-07 incident was written up with red-then-green proof; the EPF cron authenticates with a constant-time secret and can never write across users.
5. Consistent error plumbing (`lib/errors.ts` in 58 files, global handlers, redaction) and a large, passing pure-logic test base (114 `shared/` test files) that made this audit's tracing possible.

---

## Appendix 1 — Finding → Jira mapping

| Finding | Ticket | Finding | Ticket | Finding | Ticket |
|---|---|---|---|---|---|
| SEC-01 | KAN-79 | DI-05 | KAN-91 | EPF-03 | KAN-102 |
| SEC-02 | KAN-80 | DI-06 | KAN-92 | EPF-04 | KAN-103 |
| SEC-03 | KAN-81 | DI-07 | KAN-93 | EPF-05 | KAN-104 |
| SEC-04 | KAN-82 | DI-08 | KAN-94 | RT-01 | KAN-105 |
| SEC-05 | KAN-83 | DI-09 | KAN-95 | RT-02 | KAN-106 |
| SEC-06 | KAN-84 | DI-10 | KAN-96 | RT-03 | KAN-107 |
| SEC-07 | KAN-85 | INV-01 | KAN-97 | RT-04 | KAN-108 |
| SEC-08 | KAN-86 | INV-02 | KAN-98 | AUTH-01 | KAN-109 |
| DI-01 | KAN-87 | INV-03 | KAN-99 | AUTH-02 | KAN-120 |
| DI-02 | KAN-88 | EPF-01 | KAN-100 | AUTH-03 | KAN-110 |
| DI-03 | KAN-89 | EPF-02 | KAN-101 | AUTH-04 | KAN-111 |
| DI-04 | KAN-90 | ARCH-01 | KAN-114 | AUTH-05 | KAN-112 |
| ARCH-02 | KAN-115 | ARCH-03 | KAN-116 | AUTH-06 | KAN-113 |
| WEB-01 | KAN-117 | OBS-01 | KAN-118 | TEST-01 | KAN-119 |

Existing related tickets: KAN-72 (EPF security/integrity), KAN-75 (EPF index perf),
KAN-77 (holding does not deduct cash), KAN-23 (rules testing), KAN-64 (EPF epic).

## Appendix 2 — Emulator probe (evidence for Section B/H)

Run on 2026-09-12 against `firestore.rules` at `30e478a` with
`@firebase/rules-unit-testing`; 21/21 assertions matched the predicted outcome.
Cases marked *succeeds* are the vulnerabilities; *fails* are controls that work.

| Actor | Operation | Result |
|---|---|---|
| any signed-in uid | `setDoc(system_settings/global, {maintenanceMode:true, disableSignups:true, announcementBanner, enableInvestments:false}, merge)` | **succeeds** |
| any signed-in uid | `setDoc(system_settings/global, {defaultCurrency:"ZWL"}, merge)` | **succeeds** |
| owner | `setDoc(users/{me}, {role:"SUPER_ADMIN"}, merge)` | **succeeds** |
| stranger | read/write `users/{victim}` | fails ✓ |
| vault member | `deleteDoc(vaults/v1)` | **succeeds** |
| vault member | overwrite + delete owner's `vaults/v1/expenses/ve1` | **succeeds** |
| vault member | `updateDoc(vaults/v1, {name, budget:-1})` | **succeeds** |
| vault member | change `memberIds` / `ownerId` | fails ✓ |
| attacker | create vault with victim in `memberIds` | **succeeds** |
| split participant | `updateDoc(splits/s1, {settled:true, totalAmount:0})` | **succeeds** |
| split participant | rewrite `participants[]` | **succeeds** |
| split participant | `deleteDoc(splits/s1)` | **succeeds** |
| split participant | change `participantIds` | fails ✓ |
| anonymous | `getDocs(paymentRequests)` | **succeeds** |
| anonymous | `getDocs(splitPublicShares)` | **succeeds** |
| creator | `updateDoc(paymentRequests/pr1, {createdBy: victim})` | **succeeds** |
| creator | `updateDoc(splitPublicShares/sh1, {createdBy: victim})` | **succeeds** |
| anonymous | `getDocs(splitShareClaims)` | fails ✓ |
| owner | expense with `amount:-1e12, date:"not-a-date", createdAt:1, 200 KB junk` | **succeeds** |
| owner | arbitrary `epfMeta/scheduler` fields | **succeeds** |
| owner | 500 KB blob in `users/{me}/zzzAnything/x` | **succeeds** |

The probe file was run from the repo's `firestore/` directory and removed afterwards;
it is reproduced verbatim in KAN-119 as the basis for the regression suite.
