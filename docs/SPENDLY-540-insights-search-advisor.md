# SPENDLY-540: Phase 3c, Insights: Search & Lab and AI Advisor

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-540-insights-search-advisor`.

This story covers the Search & Lab tab (`AnalysisLabView`, `components/analytics/search/*`) and the AI Advisor tab (`components/ai/AiAdvisorView.tsx`).

It is UI only. No query, search, advisor-engine or storage logic changed. The filter sheet and export modal are forms and belong to Phase 6.

## Changes
- **Search & Lab palette.** All search components use `useInsightSurface()` / `useInsightAccents()`.
  - Result rows: expenses use `spend` (info) and income uses `positive`, instead of pink and green.
  - Brand colour (`accent`): the sort selection, active period chips, filter dot, "Clear all" and the search focus ring.
  - Summary columns: Matched uses `accent`, Total Sum `spend` and Average `highlight`, instead of fixed rgb strings.
  - Account names on rows are muted instead of coloured like a link.
- **AI Advisor colours.**
  - User bubbles and the send icon use `primaryForeground` instead of `#FFFFFF`. White on Midnight Emerald's bright-green primary was hard to read.
  - The highlight card uses the theme `success`/`warning` tokens and the bot chip a `withAlpha(primary)` tint, instead of fixed hex/rgba.
- **AI Advisor summary bar.** `Card` wrapped the children in its own column body, so the reset button sat under the icon with empty space beside it. It is now a single row on the theme card surface. The reset and send buttons have accessibility labels.

## Bugs fixed
- **Literal `**` markers.** Advisor replies are written with `**bold**` markers but were rendered as plain text, so users saw the asterisks. The new `shared/utils/advisorText.ts` (`parseAdvisorText`) renders them as bold spans at display time.
- **Ghost-mode leak in the advisor.** The welcome message, every reply, the highlight card and the summary bar printed amounts ("INR 31,693"). In ghost mode, `maskAdvisorAmounts` masks any currency-marked amount at render time. Stored chat history is not rewritten.
- **Raw ISO dates** on search result rows (and in their accessibility labels) now follow the user's date format.

## Not done
- **Search field focus outline.** On web the shared `SearchBar` shows the browser's square focus outline inside the rounded field. `SearchBar` has 23 callers across products, so it needs its own story.
- **Advisor wording.** The advisor still writes "INR 31,693" and "2026-10" (month key) in its text. That is the advisor engine's wording (`services/aiAdvisorService.ts`), not presentation.
- **Advisor chat height.** The chat list keeps its fixed 380 px scroll area.
- `FilterSheetModal` keeps the old `insightSurface`/`insightAccents` until Phase 6.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean.
- `npx vitest run` passed 5,528, including 6 new `advisorText` tests:
  - bold parsing;
  - an unmatched marker;
  - ghost masking;
  - symbol, code, "Rs" and negative amounts;
  - percentages, counts and years left alone.
- **Web, local test mode** (seeded emulator, themes picked in Appearance):
  - **Search & Lab** (query "groc"): Midnight Emerald 390 dp, Light 390 dp and Midnight Emerald 320 dp have 0 console errors, no overflow and no raw ISO dates. Ghost mode shows 0 visible ₹ amounts (298 hidden).
  - **AI Advisor** (sent "Analyze my monthly spending"): the same three runs have 0 console errors, no overflow and 0 literal `**`. Ghost mode masks all chat amounts. The only visible "₹3,000" is the fixed suggestion "Can I spend ₹3,000 this weekend?".
- Android and iOS have not been built.
