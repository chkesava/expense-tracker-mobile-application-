# SPENDLY-203: What If Simulator QA, performance, safety and rollout

**Ticket:** [SPENDLY-203](https://kesavach.atlassian.net/browse/SPENDLY-203) · **Epic:** [SPENDLY-195](SPENDLY-195-what-if-simulator.md)
**Branch:** `feature/SPENDLY-203-what-if-qa`, cut from `feature/SPENDLY-195-what-if-simulator`.
**Suite:** `shared/utils/whatIf.qa.test.ts` (25 tests). It's repeatable and deterministic, with synthetic data only.

## Calculation QA (with reconciliation)
**How deltas are checked:** every scenario delta is checked against an **independent expectation**: the sum of the scenario's own events over the projection window, expanded with the engine's `occurrencesBetween`. Every projection is also checked to **reconcile**: each month opens at the previous close, and closing = opening + inflow − outflow, starting from the liquid balance.

| Case | Result |
|---|---|
| Empty scenario | Identical to the baseline, delta 0 in every month |
| Income increase / decrease | Reconciles |
| New monthly expense / cut an expense | Reconciles |
| One-time purchase / one-time income | Reconciles |
| Monthly saving (goal) | Reconciles |
| Recurring change with an end date | Reconciles; stops after its last month |
| Removing an existing commitment (rent) | Matches exactly one canonical event; adds back exactly its occurrences |
| EMI / amortization | Payments sum to principal + interest; the final balance is 0; down payment and fees are included; reconciles |
| Zero-interest EMI | Repays exactly the principal |
| Multiple simultaneous assumptions | Total delta equals the sum of each change's own delta |
| Existing commitments | Kept, never double counted |
| Month-end / year boundary | A start on the 31st clamps to short months (Feb 28) and crosses into the next year |
| Leap year | A Feb 29 start lands on Feb 29, 2028 and Feb 28, 2029 |
| Negative / zero / past-dated inputs | Refused by the form builder and by `validateWhatIfAdjustment` |
| Missing data | No liquid balance gives "Not enough data yet"; it never invents a result |
| Very long projections | 24 months works; 25 is refused |
| Determinism | The same inputs produce byte-identical output |

**Investments:** returns are explicit user assumptions in the SPENDLY-200 engine (`whatIfGoals.test.ts`). The screens don't offer an investment-return change yet. The disclosures say returns aren't modelled.

## Isolation QA
- **Inputs are never mutated:** the baseline, the scenario, and the source subscriptions and expenses are unchanged after projection. This was verified by serializing before and after.
- **A source scan covers every What If file:**
  - the screens, components, store and hooks;
  - `shared/utils/whatIf*`.

  None of them names a financial collection in a Firestore `collection()`/`doc()` call, or calls any ledger, goal, subscription or calendar mutation API. **Only `services/whatIf/whatIfScenarioStore.ts` writes**, and only to `whatIfScenarios`.
- **So the simulator can't** create transactions or modify balances, goals, investments, subscriptions or Financial Calendar records.
- **Cross-user access:** `firestore/whatIfScenarios.rules.test.ts` (202) covers owner and duress access, denial for other users and anonymous users, and the schema, history, version and `id` guards.

## Performance QA
- **The baseline is prepared once:** `useWhatIfBaseline` memoises the snapshot from the data Runway already loads. Input changes don't re-read history. Building it from 25,000 expenses takes under 500 ms; in tests it takes milliseconds.
- **Recalculation is fast:** a busy scenario (24 months, 60 commitments, 20 changes including 5 loans) recalculates in under 60 ms per run, averaged over 50 runs. The test run measured about 9 ms. Each input change re-runs it once.
- **Device:** Android frame timing still needs measuring on a low or mid-range phone; see the checklist.

## Accessibility and labelling
- Every metric and month row has a full-sentence screen-reader label (tested). The headline is a `summary`; legends are hidden in favour of the row labels.
- Touch targets are 44 dp or larger, and the lists don't scroll horizontally.
- Outputs say **"Estimate"**. "About these numbers" lists what isn't modelled: taxes, unentered fees, market and investment returns. It also states that nothing changes real records.

## Known limitations (visible in the app or the docs)
- **Projections start today:** the engine projects from today only, so a saved scenario always recalculates against today's data, and its saved date is shown as provenance.
- **Loan prepayment** isn't modelled. There's no prepayment in the SPENDLY-199 loan engine.
- **Investment-return scenarios** exist in the engine but have no screen yet.
- **Web dev builds crash after sign-in.** This already happened before this epic (`CSSStyleDeclaration` indexed property; see SPENDLY-387). It needs its own ticket. Android is the release target.

## Rollout and rollback
1. **Merge order:** merge the epic to `main` (PR), after its device QA.
2. **Deploy Firestore rules first:** rules only, never indexes, using the *Deploy Firestore rules* workflow (dry-run, then the real run). This makes `whatIfScenarios` writes work. The deploy is safe at any time, because older app versions never touch the collection.
3. **Then release the app:** *Release — Expense*.
4. **Rollback / disable:**
   - Remove the `whatIf` drawer item and the Runway and Goal Funding entry rows, or revert the epic merge.
   - No financial data is affected; the simulator never writes it.
   - Saved scenarios stay in `whatIfScenarios`, untouched and restorable if the feature returns.
   - No migration is needed in either direction.

## Device QA checklist (Spendly Test + emulator)
1. Side menu → **What If** → run through the SPENDLY-387 guide (create, edit, save, rename, duplicate, archive, restore, delete).
2. After each action, check that the transactions, account balances, goals, subscriptions and the calendar are unchanged.
3. Build a 24-month scenario with 10 or more changes on a low or mid-range Android phone. Typing into the change sheet and adding or removing changes should feel instant, with no dropped frames.
4. TalkBack: the headline, key numbers and each month are read as full sentences.
5. Dark mode, the largest font size and a small screen: no clipped text, and no horizontal scroll.
6. Offline: rename or archive a scenario, then reconnect. The outbox replays it once.

## Commands
```text
npx vitest run shared/utils/whatIf.qa.test.ts
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
npm run test:rules
```
