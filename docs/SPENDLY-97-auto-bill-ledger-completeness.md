# SPENDLY-97 — Implementation plan

**Ticket:** [SPENDLY-97](https://kesavach.atlassian.net/browse/SPENDLY-97) — *Auto credit-card bills can generate from a truncated (staged) expense snapshot* (Bug, Medium, To Do)
**Baseline:** `main` @ `8e7e2bd` (SPENDLY-95)
**Scope:** Spendly only. No Ganesh Seva or Nutrition surface is touched.
**Status:** Implemented on `SPENDLY-97-auto-bill-ledger-completeness`. `npm test` (239 files / 3117 tests), `npm run typecheck` and `npm run typecheck:shared` all pass.

---

## 1. Context

`FinanceDataProvider` loads expenses in two stages for first-paint performance (SPENDLY-12):

1. Staged: `orderBy("createdAt","desc")` + `limit(LEDGER_STAGED_LIMIT)` (300) — `providers/FinanceDataProvider.tsx:380-392`
2. Idle upgrade to the unlimited query via `scheduleIdleWork` — `providers/FinanceDataProvider.tsx:407-439`

`applyExpensesSnap` (`FinanceDataProvider.tsx:344-359`) calls `setExpensesLoading(false)` on the **staged** snapshot, and the upgrade deliberately does not set loading again. The upgrade callback sets no state at all, so **nothing outside that effect can observe that the ledger is still a 300-row page.**

Auto bill generation fires off exactly that flag (`CreditCardBillsProvider.tsx:607-612`), 400 ms after the staged snapshot, racing an upgrade scheduled for idle/after-interactions. Generation backfills `AUTO_CREDIT_CARD_BILL_BACKFILL_CYCLES = 12` cycles, and `previewClosedCycleCreditCardBill` sums whatever subset is in memory — so for any user with >300 expenses, older cycles get **understated** `statementAmount` written to Firestore, or no statement at all when a cycle's spend falls entirely outside the page.

Ordering is by `createdAt`, not `date`, so this is not "the newest 300 days of spend" — an expense entered months ago simply falls off regardless of its date.

**Intended outcome:** auto bill generation only ever runs against the complete expense history, first paint stays exactly as fast as it is today, and the existing staged/idle-upgrade pattern is untouched.

---

## 2. Design

Introduce an explicit ledger-completeness signal and gate generation on it. Three small edits plus two new pure helpers.

### 2.1 New pure helper — `shared/utils/ledgerSnapshot.ts`

`LEDGER_STAGED_LIMIT` already lives here. Add the completeness rule next to it:

```ts
/**
 * SPENDLY-97: a staged page shorter than the cap IS the whole ledger, so small
 * users never wait for the idle upgrade. A cache-only snapshot is not trusted —
 * a cold cache returns a short page that is not the full history.
 */
export function isStagedPageComplete(snap: {
  docs: { length: number } | unknown[];
  metadata: { fromCache: boolean };
}): boolean;
```

Rule: `docs.length < LEDGER_STAGED_LIMIT && !snap.metadata.fromCache`.

Use `snap.docs.length`, **not** `items.length` — `foldLedgerSnapshot(..., { activeOnly: true })` drops soft-deleted rows, so the folded count is not a reliable "did we hit the cap" proxy.

### 2.2 New pure helper — `shared/utils/autoCreditCardBills.ts`

The run decision moves out of the provider so it is testable (vitest does not cover `providers/**`):

```ts
/** SPENDLY-97: never generate from a first-paint page. */
export function canRunAutoCreditCardBillGeneration(state: {
  billsLoading: boolean;
  expensesLoading: boolean;
  paymentsLoading: boolean;
  expensesComplete: boolean;
}): boolean;
```

### 2.3 `providers/FinanceDataProvider.tsx`

- Add `const [expensesComplete, setExpensesComplete] = useState(false);` beside `expensesLoading` (~line 199).
- Reset it to `false` in the signed-out branch (~line 301, with the other resets) and at the top of the subscribe path (~line 327, beside `setExpensesLoading(...)`). The effect re-runs on `financeAttempt`, so `retryFinanceData` correctly re-arms the gate.
- Turn `applyExpensesSnap` into a small factory so the two listeners are distinguishable — the handler is currently shared verbatim and cannot tell staged from full:

```ts
const makeApplyExpensesSnap =
  (fromCompleteQuery: boolean) => (snap: QuerySnapshot) => {
    /* ...existing body unchanged... */
    setExpensesLoading(false);
    if (fromCompleteQuery || isStagedPageComplete(snap)) setExpensesComplete(true);
  };
```

Staged listener uses `makeApplyExpensesSnap(false)`; the idle-upgrade listener uses `makeApplyExpensesSnap(true)`. **Do not** add `setExpensesLoading(true)` anywhere — AC5.

The unlimited listener marks complete even when `fromCache`: an offline cache-served unlimited snapshot is the entire local ledger, and is the same data every other screen already renders. Only the *staged short page* shortcut requires a server snapshot.

- Add `expensesComplete: boolean` to `ExpensesContextType` (lines 82-92), to the `expensesValue` `useMemo` object **and its dep array** (lines 1235-1252).

### 2.4 `hooks/useExpenses.ts`

The hook destructures explicitly and re-maps names, so a new context field is invisible until added here. Expose it as `complete` (keeping `expensesComplete` in the context type):

```ts
/** SPENDLY-97: false while the ledger is still the staged first-paint page. */
complete: expensesComplete,
```

Blast radius is exactly these two files plus `CreditCardBillsProvider` — the 25 other `useExpenses` callers are unaffected. `hooks/useFinanceData.ts` has zero consumers.

### 2.5 `providers/CreditCardBillsProvider.tsx`

- Pull `complete: expensesComplete` from `useExpenses()` (line 155).
- Replace the guard at line 374 with `if (!user || !canRunAutoCreditCardBillGeneration({...})) return;` and add `expensesComplete` to the `useCallback` deps (582-595). This guard matters on its own: the AppState `active` listener (614-619) calls `scheduleAutoGenerate` directly and can fire during a re-subscribe, before completeness returns.
- Replace the trigger-effect guard (607-612) the same way, adding `expensesComplete` to the deps. `didInitialAutoGenerate.current` is only set once the gate passes, so the one-shot-per-session behaviour from SPENDLY-45 is preserved — it simply now fires on complete data instead of a page. No change to the reset effect at 170-174.

No change to the fingerprint (420-442). Deterministic doc ids (`autoCreditCardBillDocId`, SPENDLY-45) already make a replay a merge, so a later AppState pass over complete data converges rather than duplicating.

### 2.6 Repair of already-affected bills (AC6 — explicit answer)

| Case | Behaviour after this fix |
|---|---|
| Understated auto bill, not PAID/CANCELLED | **Converges automatically.** `collectAutoCreditCardBillRefreshPatches` recomputes it on the next generation pass, which now always runs on full history. No migration needed. |
| Understated auto bill already **PAID** or **CANCELLED** | **Deliberately left alone.** `collectAutoCreditCardBillRefreshPatches:266-273` skips them, and `autoCreditCardBills.test.ts` pins that ("does not rewrite a PAID auto statement"). SPENDLY-38 §6.4 decided rewriting a PAID `statementAmount` desyncs `amountPaid`/`status` and can flip a settled bill back to unpaid. |
| Manual bills | Never touched (`isAutoCreated` note check). |

No one-off data correction ships with this ticket. State that on the Jira ticket and file a sibling for a **user-triggered** "recalculate statement" affordance on a PAID auto bill, where the user sees the old and new amount and confirms — the only safe way to correct a settled statement.

### 2.7 Out of scope (note on the ticket, do not expand)

`expenses` is truncated for every other consumer too, including write paths — `hooks/useSmsRecurringSync.ts:19` gates on `expensesLoading` and writes recurring subscriptions. Same class of bug, different blast radius. File separately rather than widening SPENDLY-97. Incomes have the identical staged/upgrade shape and get no completeness flag here.

---

## 3. Files to modify

| File | Change |
|---|---|
| `shared/utils/ledgerSnapshot.ts` | new `isStagedPageComplete` |
| `shared/utils/ledgerSnapshot.test.ts` | cases for it |
| `shared/utils/autoCreditCardBills.ts` | new `canRunAutoCreditCardBillGeneration` |
| `shared/utils/autoCreditCardBills.test.ts` | gate cases + truncated-vs-full regression |
| `providers/FinanceDataProvider.tsx` | `expensesComplete` state, handler factory, context type + memo |
| `hooks/useExpenses.ts` | expose `complete` |
| `providers/CreditCardBillsProvider.tsx` | gate `generateAutoBills` and the trigger effect |
| `docs/SPENDLY-97-auto-bill-ledger-completeness.md` | new: problem, decision, AC6 answer |

---

## 4. Tests (AC7)

All in vitest (`npm test`), pure-util style matching the existing suites — no new deps, no `vitest.config.ts` change.

**`shared/utils/ledgerSnapshot.test.ts`** — `isStagedPageComplete`:
- short server page (`10 < 300`, `fromCache: false`) → `true`
- full page (`300`, `fromCache: false`) → `false`
- short **cache** page → `false` (the cold-cache trap: a 0-doc cached snapshot must not look complete, or refresh patches would zero out real statements)

**`shared/utils/autoCreditCardBills.test.ts`** — new `describe("SPENDLY-97")`:
- `canRunAutoCreditCardBillGeneration`: blocked when `expensesComplete: false` even with all three loading flags `false` (the exact production race); allowed when complete; still blocked by any loading flag.
- **Race regression, the important one.** Build >`LEDGER_STAGED_LIMIT` expenses across >12 cycles for one card using the existing `creditCard` fixture and `expense(date, amount)` factory in that file. Assert:
  - `collectAutoCreditCardBillDrafts` over the **truncated** 300 newest-by-`createdAt` slice produces amounts that differ from the full set — this is the bug, pinned so a regression is visible.
  - over the **full** set, every draft equals the amount computed from full history (AC2).
  - a cycle whose spend lies entirely outside the staged slice yields a draft with the correct amount from the full set, and nothing from the truncated slice (AC3).

Run `npm test` and `npm run typecheck` (AC8). `npm run typecheck:shared` too, since `shared/` changed.

---

## 5. Manual verification

Per `AGENTS.md`, after implementing:

1. `npx expo start` — hot reload covers it, no build needed.
2. On an account with **>300 expenses** and a credit card with `billGenerationDay` set, cold-start the app. Older statements must show their full amount on first paint and **must not** change a second later.
3. Watch the Firestore console on `users/{uid}/creditCardBills`: no `statementAmount` should be written and then rewritten upward within the first few seconds.
4. Background/foreground the app — the AppState pass must be a no-op (fingerprint unchanged), not a rewrite.
5. On an account with **<300 expenses**, confirm generation still runs promptly (the short-page shortcut) and first paint is not visibly slower.
6. Offline (airplane mode) cold start: the unlimited cached snapshot still marks complete, so generation runs against the full local ledger rather than being blocked forever.
7. Web (`npm run web`): `scheduleIdleWork` takes the `requestIdleCallback` branch and AppState `active` does not fire the same way — confirm the initial pass still runs once the upgrade lands.

## 6. Ticket hygiene

- SPENDLY-97 → **In Progress** when work starts.
- Branch `SPENDLY-97-auto-bill-ledger-completeness`; `SPENDLY-97` in the PR title and the browse URL in the body.
- On merge to `main` → **Done**, with the AC6 statement (§2.6) and the two follow-up tickets (PAID-bill recalculate affordance; truncated-ledger write paths, §2.7) as leftovers.
