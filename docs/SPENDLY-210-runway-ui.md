# SPENDLY-210: Runway timeline, threshold planning and explanatory UI

**Ticket:** [SPENDLY-210](https://kesavach.atlassian.net/browse/SPENDLY-210) (Story)
**Epic:** [SPENDLY-204](https://kesavach.atlassian.net/browse/SPENDLY-204). See the [epic record](SPENDLY-204-financial-runway.md).
**Branch:** `feature/SPENDLY-210-runway-ui`, cut from the epic branch after 208.
**Depends on:** 205–208.

**Dependency decision (2026-10-03, product owner):** 210 no longer waits for 209.
- The screen ships with **net burn**, **essential burn** and a **projection** built from recurring items and unpaid card bills.
- SPENDLY-209 still waits for SPENDLY-176 and will later add Financial Calendar events to the same projection. No second calendar is built.
- The Jira link "209 blocks 210" must be removed by hand, since there's no tool access for deleting links.

---

## 1. What users see
**Entry:** Money & Accounts → **Financial runway** row, placed under the net worth card. The row is a link only, so the accounts list does no extra work.

**`/runway` screen, top to bottom:**
1. **Mode switch:** Projection / Net burn / Essentials. The choice is saved.
2. **Headline card:**
   - a badge that always says **ESTIMATE**, **BELOW RESERVE** or **NOT ENOUGH DATA**;
   - the confidence grade;
   - the big figure, e.g. "About 5½ months", "More than 12 months", "Not running down" or "Below your reserve now";
   - the threshold date sentence and the mode name.

   Screen readers get all of it in one label.
3. **Key figures:**
   - counted money, which opens Runway sources (207);
   - monthly burn;
   - expected money in and out over the horizon;
   - the lowest projected balance and its date;
   - the reserve.
4. **Month by month:** the actual months from the 208 baseline, then **"Projected from today"** months. Each row has:
   - a text tag, **Actual** or **Projected**;
   - a solid bar for actual months and a dashed, outlined bar for projected ones;
   - the surplus or deficit, and for projected months the closing balance;
   - **⚠ Below reserve** in words when the balance drops under the reserve.

   Meaning never depends on colour alone. Each row has a full screen-reader sentence.
5. **Biggest drivers:** the top 6, each marked money in or out, with its share.
6. **Unusual one-offs:** listed, with a note saying whether they are included.
7. **How this is worked out** (expandable):
   - the mode formula;
   - the history window, method and month count;
   - any months left out;
   - unusual items;
   - how double counting is avoided;
   - every active assumption;
   - "planning estimate, not a prediction; never changes your records".

**Settings sheet** (the header sliders button) controls:
- the reserve threshold: none, a fixed amount, or N months of essentials;
- the history window: 3, 6 or 12 months;
- the method: average or median;
- whether to include unusual one-offs;
- how far to project: 6, 12 or 24 months.

**Empty, error and loading states:**
- **No accounts:** "Add an account to see your runway", with a button to the accounts screen.
- **No complete month recorded:** "Record a full month to get an estimate", with an explanation. The figures stay hidden rather than showing a misleading number.
- **Errors:** the standard error state with a retry button.
- **Loading:** a skeleton.

## 2. Data
- **`users/{uid}/runwaySettings/default`** stores `{ mode, thresholdKind, thresholdAmount, thresholdMonths, windowMonths, method, includeUnusual, projectionMonths, updatedAtMs }`.
  - It's scoped to duress mode and written whole through `commitMutations`, so it works offline.
  - Reads are normalised (`normalizeRunwaySettings`), so a missing or odd document falls back to the defaults.
- **Rules (`runwaySettingsWellFormed`):**
  - owner and duress twin only;
  - the id must be `default`;
  - `hasOnly` with every field required;
  - closed enums;
  - bounded numbers: reserve 0–10¹², months 0–24, projection an integer from 1 to 24.

  A TS↔rules contract test keeps the fields, enums and bounds in sync.
- **Listeners** (sources, overrides, settings) mount only on the runway screens. No financial record is ever written.

## 3. Pipeline
`buildRunwayModel` (`shared/utils/runwayModel.ts`) is pure and tested. It runs:
1. sources (207);
2. baseline (208), using `projectionBaseline` for the projection and `burnBaseline` for the burn modes;
3. events: recurring items and card bills, projection mode only;
4. the engine (206);
5. confidence (205).

`shared/utils/runwayView.ts` turns the result into the headline, the timeline rows with their screen-reader labels, and the methodology lines.

## 4. Acceptance criteria
| Criterion | How |
|---|---|
| Current or estimated runway is clearly labelled | Badge, "planning estimate" subtitle, mode name, confidence |
| Historical and projected periods look distinct | Actual/Projected tags, solid vs dashed bars, a "Projected from today" heading |
| Threshold crossing is clearly identified | Threshold date sentence, "Below reserve" icon plus words on the month, lowest-balance figure |
| Methodology can be inspected | The expandable "How this is worked out" section |
| No colour-only meaning | Every state carries words; tested in `runwayView.test.ts` |
| Dynamic font and screen readers supported | Text uses theme typography (scales with the system font), combined accessibility labels, header roles, ≥44dp rows |
| Empty and insufficient-data states are useful | No-accounts and record-a-full-month states, both with a next step |
| Android scrolling and chart performance stay smooth | Plain-view bars (no chart library, no SVG); a memoised timeline; at most 12 actual + 24 projected rows. **Needs a device check** |
| Existing design system is used | PageShell/PageHeader, SegmentedControl, ChipRow/RowSwitch, Input, Button, Modal, theme tokens |

## 5. Files
| File | What |
|---|---|
| `app/(app)/runway/index.tsx` | The screen |
| `components/runway/RunwayTimeline.tsx`, `RunwaySettingsSheet.tsx`, `RunwayEntryRow.tsx` | UI pieces |
| `hooks/useRunway.ts`, `hooks/useRunwaySettings.ts` | Data |
| `services/runway/runwaySettingsStore.ts` | Saving settings |
| `shared/utils/runwayModel.ts`, `runwayView.ts`, `runwaySettings.ts` (+tests) | Pure pipeline, view model, settings |
| `shared/utils/runwaySettings.rules.contract.test.ts`, `firestore/runwaySettings.rules.test.ts` | Rules contract and emulator tests |
| `firestore.rules` | `runwaySettings` block |
| `components/accounts/AccountsList.tsx` | Entry row |
| `app/(app)/_layout.tsx`, `navigation.ts`, `routeRestoration.ts` (+tests) | Route, Android back, restore |

## 6. Rollout
Deploy the Firestore rules (**rules only, no indexes**) before the app. Without them, saving settings fails and the screen falls back to the default settings.

## 7. Manual testing guide
Use Spendly Test on the emulator.
1. Go to Money & Accounts → **Financial runway**.
   - With no complete month recorded, you should see "Record a full month…".
   - With history, you should see the estimate.
2. Switch Projection / Net burn / Essentials. The figure and the mode name change, and the choice persists after reopening.
3. Settings → set a fixed reserve above your counted money. The badge should say **BELOW RESERVE**. Set a lower one and check the threshold date moves earlier.
4. Check the month list: Actual rows come first, then "Projected from today", and any month under the reserve shows the ⚠ words.
5. Turn on TalkBack. The headline and each month should read as full sentences. Try large font sizes.
6. Turn on airplane mode and change a setting. The toast should say it will sync.
