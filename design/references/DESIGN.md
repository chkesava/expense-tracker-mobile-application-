# Spendly Dashboard & Drill-Down Design System

Version: 1.0  
Purpose: Shared design contract for Claude Code when implementing dashboard and financial drill-down Jira stories.

## 1. Source-of-truth order

1. Inspect the actual repository theme tokens, reusable components, navigation, and accessibility conventions first.
2. Use this document as the consistency contract for newly redesigned dashboard/drill-down screens.
3. Use the reference images for layout, hierarchy, information architecture, and interaction ideas—not as sources of production financial data.
4. If a reference image conflicts with the established app architecture or financial correctness, preserve the architecture and correctness, then document the visual deviation.
5. The `generated/` folder contains originals retained for traceability. The named `spendly-*.png` files are convenient aliases; verify the contents visually before relying on an alias. Never claim a missing or uninspected image was reviewed.

## 2. Visual direction

**Product feel:** premium fintech, calm, precise, data-forward, accessible.  
**Primary direction:** Midnight Slate (SPENDLY-617; replaced Midnight Emerald) for redesigned dark surfaces. Preserve an existing light theme if the app already supports one; do not force dark colors into a light-mode screen.  
**Avoid:** uncontrolled gradients, heavy glass blur, random accent colors, oversized shadows, excessive nested cards, decorative charts with no meaning, and new UI kits that duplicate existing components.

### Core dark palette

Six blue-greys carry surfaces, text and brand. Colour appears only where it means something.

| Token | Hex | Usage |
|---|---|---|
| `background` | `#06141B` | Main dark screen background |
| `surface` | `#11212D` | Primary cards and grouped content |
| `surfaceElevated` | `#253745` | Chips, raised surfaces, selected containers, borders |
| `line` | `#4A5C6A` | Outlines and dividers only (too faint for text or icons) |
| `textSecondary` | `#9BA8AB` | Supporting labels, metadata, inactive icons |
| `textPrimary` / `accent` | `#CCD0CF` | Primary text, primary buttons (dark label `#06141B`), selected state |
| `positive` | `#35E889` | Money in, gains, success only |
| `negative` | `#FF7777` | Losses, over-budget, destructive actions only |
| `warning` | `#F5C451` | At-risk or caution state |
| `info` | `#78B8FF` | Informational state, plain spending, secondary data series |

### Light-mode compatibility

If the current screen is using the established light dashboard, do not replace it unexpectedly. Derive equivalent tokens from the existing theme. Use near-white surfaces, dark text, subtle borders, and restrained accent tints. Theme colors must come from central tokens—not hardcoded per-screen values.

### Color semantics

- Slate `#CCD0CF` is the brand/selection color. Green and red are reserved for money meaning (gains/losses) and status; never use them for selection, branding or decoration.
- Use red for negative financial movement, over-budget or destructive actions—not for ordinary neutral labels.
- Use amber for warning/near-limit states.
- Keep chart series colors stable across all screens. Reuse existing chart palette if defined; otherwise use a restrained, color-blind-considerate set and map categories consistently.
- Do not infer that an expense is “bad” merely because its amount is large. Use neutral category colors and clear labels.
- Never use color alone to convey status; add text/icon/shape.

## 3. Typography

- Use the app's existing font family and typography components.
- Screen title: strong, concise, generally 24–30sp depending on existing conventions.
- Section title: 16–18sp, semibold.
- Primary financial amount: 28–36sp for hero values; 18–22sp in lists.
- Body: 14–16sp.
- Supporting labels: 12–14sp; never below accessible legibility without a strong reason.
- Use tabular/consistent number formatting where available; align financial amounts for easy scanning.
- Currency must use the user's configured locale/currency formatting, not hardcoded symbols or formatting.

## 4. Layout, spacing, and surfaces

- Follow an 8pt spacing rhythm: 4, 8, 12, 16, 24, 32.
- Screen horizontal padding should follow existing app standards; target 16–20dp on mobile.
- Card radius: typically 16–24dp; controls/chips 10–16dp; pills fully rounded only when semantically appropriate.
- Use thin, low-contrast borders for grouping. Shadows should be subtle and platform-safe.
- Keep the main content scrollable and avoid fixed-height assumptions.
- Respect Android status/navigation bars, safe areas, keyboard avoidance, and minimum 44–48dp touch targets.
- Keep dashboard return scroll position when navigating into details and back.
- Do not put every field inside its own card; group related information meaningfully.

## 5. Shared component patterns

Build on existing components and libraries; do not add a competing UI system.

- `ScreenHeader`: back action, title, optional subtitle/action.
- `PeriodSelector`: one shared pattern and stable period semantics.
- `MetricSummary`: label, value, optional comparison and accessible explanation.
- `ProgressIndicator`: consistent track, status semantics, labels, and over-limit treatment.
- `CategoryRow`: icon, label, amount, share/progress, disclosure affordance.
- `TransactionRow`: merchant/title, category, date, account when available, amount and type.
- `EmptyState`, `ErrorState`, `OfflineState`, `LoadingState`: consistent illustration/icon and recovery action.
- `FilterChips` and `SearchField`: consistent focus, selection, clear, and accessibility behavior.
- `BottomSheet` / overflow menu: use existing supported navigation and gesture libraries.

Reuse existing chart libraries. Every chart needs accessible labels and a non-gesture alternative for selecting or reading values.

## 6. Navigation and interaction rules

- Use stable IDs for category, subcategory, account, budget, and transaction routes—not display names.
- Dashboard card/row taps open the relevant detail experience; each row's hit area must be clear and accessible.
- The Spending Overview donut center opens Total Spending. A category segment/legend opens that category only when its hit target is reliable.
- A category opens category details; subcategory opens subcategory details; a transaction opens its individual details.
- Preserve reporting period, filters, selected chart point, and list scroll position across drill-down navigation.
- Use full-screen detail pages for complex analytics and transaction history; use bottom sheets for quick contextual actions.
- Provide confirmation for destructive actions and only render actions that are actually implemented.
- Respect reduced-motion settings; animation must not be required to understand a state change.

## 7. Financial data and chart rules

- The reference images contain illustrative figures, categories, merchant names, dates, and histories. Never copy these into production data.
- Use canonical Spendly domain services and established reporting rules for expense inclusion, transfers, refunds, category reassignment, credit-card payments, and date boundaries.
- Totals and percentages must reconcile with the existing dashboard for the same period and denominator.
- Label percentage denominators clearly (e.g., share of category vs share of total eligible spending).
- Compare periods only when comparable data exists. Do not invent insights from insufficient history.
- Distinguish scheduled recurring definitions from posted ledger transactions. Future scheduled payments are not completed expenses.
- Handle missing/uncategorized values explicitly rather than silently dropping them.
- Currency and date formatting must use existing app utilities and locale settings.

## 8. Performance and implementation constraints

- Inspect existing Expo/React Native architecture, Firebase services, schemas, queries, caches, and materialized summaries before coding.
- Do not add full-ledger reads to dashboard first paint.
- Avoid redundant Firestore listeners, repeated reads for the same dashboard summary, and duplicate aggregation logic.
- Prefer existing query/cache/materialized summary services; use bounded queries and document index requirements when needed.
- Keep chart and image assets local when possible; avoid remote images on every render.
- Reuse current animation, icons, and chart dependencies; verify compatibility with the current Expo/React Native version before adding dependencies.
- Test loading, empty, offline, error, insufficient-history, no-budget, and deleted-related-record states.

## 9. Reference asset inventory

| Filename | Intended use |
|---|---|
| `spendly-dashboard-reference.png` | Primary dashboard layout reference |
| `spendly-total-spending-drilldown.png` | Total Spent donut-center → total spending → categories flow |
| `spendly-spending-category-details.png` | Category analytics and transactions |
| `spendly-budget-progress-drilldown.png` | Budget overview and category budget detail |
| `spendly-recent-transactions-drilldown.png` | Dashboard recent transactions → list |
| `spendly-individual-transaction-details.png` | Individual transaction detail and contextual actions |
| `spendly-spending-trends-drilldown.png` | Spending trend, category trend and comparison |
| `spendly-spending-by-subcategory.png` | Subcategory breakdown, merchant and filtered transactions |
| `spendly-highest-spending-categories.png` | Ranked category drill-down |
| `spendly-recurring-expenses.png` | Recurring expense list, details, add/edit |
| `generated/` | Generated original image files retained without renaming |
| `spendly-dashboard-moodboard.png` | Broader dashboard moodboard when present |

Some named aliases may not be included if the corresponding source image was unavailable in the local runtime. Check `README.md` and `generated/` before assuming an asset exists.

## 10. Definition of done for visual work

- Inspect the named reference image(s) and current component implementation.
- Reuse theme tokens and shared components.
- Verify all interactive targets, back navigation, safe areas, keyboard behavior, loading/error/empty states.
- Use real data only; no mockup values in production.
- Capture screenshots at relevant Android sizes when the environment supports it.
- Compare the implementation against references and report actual differences.
- Run available lint, type checks, tests, and Android build checks; report only commands actually run and their real results.
