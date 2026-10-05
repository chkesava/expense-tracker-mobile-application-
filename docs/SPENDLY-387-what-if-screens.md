# SPENDLY-387: What If screens and side-menu entry

**Ticket:** [SPENDLY-387](https://kesavach.atlassian.net/browse/SPENDLY-387) · **Epic:** [SPENDLY-195](SPENDLY-195-what-if-simulator.md)
**Branch:** `feature/SPENDLY-387-what-if-screens`, cut from `feature/SPENDLY-195-what-if-simulator`.
**Why:** stories 196–202 built the What If logic but no screens. This story makes it usable.

## Where to find it
- **Side menu → What If.** It sits next to Financial calendar. It's in the drawer only; the bottom bar stays at five tabs.
- **Financial runway → "Try a What If"** row.
- **Goal Funding → "Try a What If"** row. This opens a new scenario from the *Save for a goal* idea.

## Screens
| Route | What it does |
|---|---|
| `/what-if` | Intro card with **New scenario**. Lists saved scenarios (active first, archived collapsed) and six starter ideas: Salary change, Big purchase, New loan / EMI, Save for a goal, Cut an expense, Bonus. |
| `/what-if/edit` | The editor: name, look-ahead (3, 6, 12 or 24 months), and changes added from a sheet: income change, monthly expense change, one-time purchase, one-time income, new loan or EMI, monthly saving. It shows a live preview of the headline result. `?template=` pre-fills the change sheet; `?id=` edits a saved scenario. |
| `/what-if/[id]` | The results. Details below. |

**The results screen shows:**
- the saved date, version and last-calculated stamp;
- an "inputs changed since you saved" notice, with **Update to today** (a versioned rebase);
- the headline answer ("−₹30,000 by Sep 2027") and the key numbers (now vs scenario);
- **Month by month**, with paired bars;
- **What makes the difference**, the drivers;
- the disclosures;
- the changes and assumptions, each with its provenance ("your assumption" or "worked out");
- the history;
- the ⋮ menu: rename, duplicate, archive or restore, delete. Delete asks for confirmation, and its text says only the scenario is deleted.

## How it works
- **`shared/utils/whatIfBaseline.ts`** builds today's `WhatIfBaselineSnapshot` from the Runway inputs:
  - counted liquid money;
  - the projection baseline;
  - subscription, EMI and card-bill events.

  It always uses the commitment projection, whatever mode the Runway screen is in, because What If changes act on scheduled events. `sourceVersions` are count:sum fingerprints per source, which drive the "changed since saved" notice.
- **`shared/utils/whatIfDraft.ts`**: the change forms and templates.
  - Each change is built with the epic's existing builders: `buildCashflowAdjustments`, `buildOneTimePurchase`, `simulateWhatIfLoan` and `savingsPlanAdjustment`. No calculation is duplicated.
  - Adjustments of one change share an id (`<type>--<suffix>`), so the change can be listed and removed as a unit.
  - Loan rate, tenure and EMI are kept as labelled assumptions with their provenance.
- **`shared/utils/whatIfView.ts`**: runs `runWhatIfProjection` and then `compareWhatIfProjection`, and turns the result into text. Lower burn and lower outflow count as "better".
- **Hooks:** `useWhatIfBaseline` reads the data `useRunway` already loads; `useRunway` now also returns its raw inputs, an additive change. Saved scenarios come from `useWhatIfScenarios` (202).

**Calculation rule (clarifies 202):** the engine projects from **today** only; it requires `today` to equal the scenario's as-of date. So a saved scenario is always recalculated against today's data. Its saved date is shown as provenance. **Update to today** records the move as a versioned `rebased` entry. The last-calculated stamp is written at most once a day per scenario, and it's metadata only.

**Writes:** only `users/{uid}/whatIfScenarios/{id}`. No transaction, account, goal or investment is ever written.

## Accessibility
- Every row, metric and month has a full-sentence screen-reader label. The headline is a `summary`.
- Touch targets are at least 44 dp. The chart legend is hidden from screen readers, because each row is labelled instead.
- Theme tokens are used throughout, so dark mode follows the app theme.

## Navigation wiring
- `navigation.ts`: the `whatIf` section (drawer only), `/what-if` sub-screen routes, and `isNavItemActive`.
- The drawer icon is `FlaskConical`.
- `nav_what_if` is translated in all 7 languages.
- `RESTORABLE_ROUTES` and the `_layout.tsx` Stack.Screens are updated, with tests.

## Validation
- **Tests:**
  - `npm test`: 5,364 passed, including `whatIfScreens.test.ts` (13) and the navigation and restoration tests;
  - `npm run test:rules`: 523 passed;
  - both typechecks are clean.
- **Web render check:** I tried it on the Firebase emulator with the demo data. The **signed-in app shell crashes on web in dev mode, on the epic branch without this story too**, with `TypeError: Failed to set an indexed property [0] on 'CSSStyleDeclaration'`. So the screens couldn't be screenshotted on web. This is an existing web issue and needs its own ticket.
- **Device QA:** pending. On Android, test with Spendly Test and the emulator.

## Manual testing guide (device)
1. Open the side menu → **What If**. Check the intro card, the empty state and the six ideas.
2. Tap **Salary change**. Enter 15000, choose **Earn more** from next month, then **Add change**.
   - **Expected:** the preview shows a positive headline.
3. Add a **One-time purchase** and a **New loan** (10%, 12 months), then remove one.
   - **Expected:** the change list and the preview update.
4. **Save scenario.**
   - **Expected:** the results open with the headline, key numbers, Month by month, drivers and disclosures.
5. ⋮ → **Rename**, **Duplicate** (opens the copy), **Archive** (it moves to Archived), **Restore**, **Delete**.
   - **Expected:** the confirmation text says only the scenario is deleted.
6. Add an expense in Money, then reopen the scenario.
   - **Expected:** the "changed since you saved" notice appears. Tap **Update to today**, and a `v… · Updated to that day's data` history line appears.
7. Check that the transactions, accounts and goals are unchanged.
8. Go offline, rename a scenario, then reconnect.
   - **Expected:** the outbox replays the change.
9. TalkBack, dark mode, and a small screen.
10. The **Financial runway** and **Goal Funding** "Try a What If" rows open What If.

**Commands:** `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit`, `npm run test:rules`. No rules change in this story. The `whatIfScenarios` rules from 202 still need deploying at rollout.
