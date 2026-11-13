---
name: spendly-responsive-ui
description: Audit and fix responsive layout issues throughout the Spendly application, including every screen, nested tab, dashboard card, chart, form, modal, navigation area, and Android layout. Use when UI is clipped, overflowing, too spaced out, difficult to use, or inconsistent across laptop, desktop-monitor, tablet, and Android phone sizes.
---

# Spendly Responsive UI Audit and Fix

## Mission

Make the **entire Spendly application** usable and visually balanced across desktop browsers and Android phones. This includes every route and every tab inside each screen—not just the dashboard or the screen currently visible.

Treat responsiveness as a product-wide quality requirement. A screen is not finished merely because its outer page fits: the content inside cards, charts, tables, tab bars, dialogs, menus, and forms must also fit and remain usable.

## Project-first rules

1. **Inspect before editing.** Read the repository's `CLAUDE.md`, `AGENTS.md`, README, package scripts, app configuration, routing structure, theme tokens, and existing responsive utilities before making changes.
2. Confirm the actual UI stack and current versions from the repository. Spendly has used Expo, React Native, React Native Web, and Expo Router; do not assume every screen is a conventional DOM page.
3. Trace the real route and component tree. Identify shared layouts, navigation, screen containers, cards, charts, tables, and tab components before changing styles.
4. Reuse the existing architecture, theme system, component library, and design tokens. Do not introduce a second design system or replace libraries without a demonstrated need.
5. Preserve current functionality, visual identity, data sources, calculations, navigation, permissions, and platform-specific behavior. This task is about responsive layout and interaction—not feature redesign or backend changes.
6. Do not solve clipping by hiding content, removing useful information, shrinking everything, or adding arbitrary horizontal scrolling to the whole page.
7. Do not make a dashboard-only fix and declare the task complete. Audit every route and nested tab.
8. Avoid unrelated refactors. Keep changes focused and explain any unavoidable shared-component impact.

## Reference viewport matrix

Physical screen size (14-inch, 16-inch, or 24-inch) does not uniquely determine the browser's usable CSS viewport. Resolution, display scaling, browser zoom, and window size all matter. Therefore, validate the following **viewport dimensions**, rather than relying on the physical diagonal alone.

| Target | Viewport to test | Purpose |
|---|---:|---|
| Compact laptop / 14-inch class | 1366 × 768 | Must work without clipped cards or hidden actions |
| Common laptop | 1440 × 900 | Verify comfortable content density |
| 16-inch laptop class | 1536 × 864 | Main desktop acceptance size |
| 24-inch monitor class | 1920 × 1080 | Use available width without stretching content excessively |
| Wide desktop | 2560 × 1440 | Keep content readable and constrain excessive line lengths |
| Small Android phone | 320 × 720 | Stress-test the narrowest supported layout |
| Common Android phone | 360 × 800 | Core mobile acceptance size |
| Larger Android phone | 390 × 844 | Core mobile acceptance size |
| Large Android phone | 412 × 915 | Verify spacing and density at larger mobile width |
| Android tablet / compact landscape | 768 × 1024 and 1024 × 768 | Check transition between phone and desktop patterns |

Also test browser zoom at 100% and 125% on desktop when browser testing is available. Do not infer that a physical display's native resolution is the same as the app viewport.

## Responsive behavior requirements

### 1. Overall page and application shell

- No page-level horizontal overflow at supported viewport sizes.
- Main content must use the available width after accounting for sidebar/navigation, with `min-width: 0` applied where flex or grid children need permission to shrink.
- Use a sensible content maximum width on very wide monitors; do not make cards or text lines grow without limit.
- Keep consistent page gutters and card spacing. Reduce gutters progressively on smaller viewports.
- Desktop side navigation may remain persistent where the existing design supports it. On phones, use the app's established mobile navigation pattern (drawer, compact header, or bottom navigation). Do not simply squeeze a desktop sidebar into the phone viewport.
- Avoid fixed pixel widths for primary page columns and content panels unless they represent a deliberate, bounded control.
- Ensure sticky/fixed headers and footers do not cover page content or important actions.

### 2. Grids and cards

- Choose the number of columns from the available content width, not just the device category.
- Cards must shrink, wrap, or reflow their internal content. A grid fitting three cards does not mean the contents of each card fit.
- Use flexible grid/flex sizing and sensible minimum widths. On narrow layouts, stack cards rather than allowing them to overflow.
- Apply `min-width: 0` to grid/flex children where long labels, charts, or nested layouts otherwise force overflow.
- Allow titles and descriptions to wrap. Use ellipsis only when truncation is intentional and the user can still access the complete value or label.
- Keep amounts, units, percentages, and their labels together where practical. Avoid clipping currency values or partially hiding the last legend item.
- Do not use fixed card heights where content can vary. Prefer content-driven height, with controlled minimum heights only where useful.

### 3. Tabs and nested screens

- Inspect every tab within every screen, including tabs that are not selected by default.
- Tab labels and controls must remain visible and actionable. If all tabs cannot fit, use the project's established horizontal tab-scrolling pattern or a deliberate compact/overflow pattern; do not clip the final tab.
- The active tab must remain identifiable when the tab strip scrolls.
- Switching tabs must not cause unexpected page-width changes, content overlap, or loss of scroll position unless that is the intended behavior.
- Each tab's content needs its own responsive audit. Do not assume the parent screen's responsive layout makes its child tabs responsive.

### 4. Charts and data visualizations

- Charts must derive their size from the available parent container. Avoid hard-coded chart widths that exceed a card at smaller sizes.
- Legends, axes, labels, tooltips, and totals must remain readable and must not be cut off by card boundaries.
- Reflow legends below charts or into a compact list when side-by-side placement no longer fits.
- On mobile, stack chart and summary content where necessary. Preserve access to all data points and labels.
- Verify charts after a viewport resize; they must recalculate rather than retaining stale dimensions.
- Do not distort chart aspect ratios or hide meaningful categories just to make a chart fit.

### 5. Tables, lists, and transaction history

- Prefer a responsive table strategy already used in the project: compact columns, row cards, or a clearly bounded horizontal table scroller.
- If horizontal scrolling is necessary for a data-dense table, confine it to that table region and make the affordance clear. Never make the entire page scroll sideways.
- Preserve access to important fields and row actions on mobile. Do not silently remove actions or important columns.
- Long names, notes, IDs, and descriptions must wrap or truncate deliberately without widening the entire screen.

### 6. Forms, menus, dialogs, and overlays

- Inputs, selects, date pickers, dropdowns, and action buttons must fit the available width and remain usable with touch input.
- Dialogs should be bounded by the viewport (including available height), with internal scrolling when their contents exceed the visible area.
- Menus and popovers must stay within the viewport and must not be rendered off-screen.
- On Android, account for the software keyboard, safe areas, system bars, and device insets where the current stack requires it.
- Maintain practical touch targets (approximately 44 × 44 CSS pixels on web; use platform-appropriate touch sizing on Android).
- Toasts, snackbars, and banners must not obscure primary navigation or critical controls. Ensure they wrap long messages and fit narrow screens.

### 7. Typography, spacing, and theme

- Use existing Spendly typography scales and theme tokens. Do not hard-code a new set of colors or replace the active theme.
- Scale spacing and typography thoughtfully at breakpoints. Do not make text so small that it technically fits but becomes difficult to read.
- Prevent long headings, numbers, and labels from pushing sibling content outside their containers.
- Preserve the selected theme (including user-selected palettes) across responsive layouts.

## Breakpoint guidance

First inspect the project's existing breakpoints and responsive helpers. Reuse them if they are coherent. If the project has no consistent system, introduce a small shared system appropriate to its actual styling technology. A reasonable starting point for **web CSS viewport widths** is:

- Below 600 px: phone layout.
- 600–767 px: large phone / compact tablet layout.
- 768–1023 px: tablet layout.
- 1024–1279 px: compact desktop layout.
- 1280–1599 px: standard desktop layout.
- 1600 px and above: wide desktop layout with a content max-width.

These are starting points, not permission to add a media query for every component. Prefer fluid sizing and a small number of well-defined layout transitions. For React Native components, use the project's established responsive abstraction or `useWindowDimensions()` where appropriate; avoid reading window dimensions once at module load if the component must respond to resizing or orientation changes. Use platform-specific styles only when a real platform behavior requires them.

## Mandatory audit workflow

### Phase A — Build a complete screen inventory

1. Inspect Expo Router routes and any custom navigation registries.
2. Enumerate all user-facing screens, nested routes, modal routes, and tabs.
3. Identify screens shared between web and Android and screens with platform-specific implementations.
4. Record the shared layout/components used by each screen.
5. Create a checklist in the working notes so every screen and nested tab is covered.

Do not stop at the dashboard. Include Money, Vaults, Investments, Analytics, Intelligence, Settings, and every other route actually found in the repository. The list above is illustrative; the repository's route inventory is authoritative.

### Phase B — Reproduce and diagnose

For each route and each nested tab:

1. Capture or inspect the screen at the reference viewport sizes.
2. Look for page-level horizontal overflow, clipped edges, overlapping elements, excessive blank space, tiny text, truncated labels, inaccessible actions, broken chart legends, fixed-width panels, and content hidden behind navigation or overlays.
3. Inspect the component hierarchy and styles causing the issue. Find the root cause rather than adding a one-off offset or shrinking the entire screen.
4. Determine whether the issue belongs in a shared shell/component or in one screen's content.
5. Record the affected route, viewport, reproduction steps, root cause, and intended responsive behavior.

Use browser/device automation already available in the repository. If Playwright or another UI test tool is installed, use it. Do not add a new automation dependency without a clear need and an explanation.

### Phase C — Fix in the right order

1. Fix shared app shell, page containers, navigation, and common layout primitives first.
2. Fix shared cards, headers, tabs, chart containers, tables, forms, and modal components next.
3. Fix remaining screen-specific layouts and exceptional data visualizations.
4. Add or update reusable responsive helpers only when they reduce duplication and match the architecture.
5. Keep visual hierarchy and existing product design intact. Reflow content instead of redesigning it unnecessarily.
6. Do not change backend services, Firestore/Supabase queries, data models, calculations, or business rules as part of a layout-only fix.

### Phase D — Regression verification

- Revisit every route and every nested tab after shared-component changes.
- Test all viewport sizes in the reference matrix that the available environment supports.
- Test orientation changes and viewport resizing without a full reload where supported.
- Test key interactions: navigation, tab switching, scrolling, forms, dialogs, dropdowns, charts, and primary actions.
- Verify both light/dark or other supported themes if the project supports them.
- Run the relevant lint, typecheck, unit tests, and web/Android build checks available in the repository.
- Check browser console and React Native logs for new warnings or runtime errors.
- Do not claim a device/viewport was tested unless it was actually tested. Clearly list any environment limitation.

## Screenshot-specific warning signs to investigate

The supplied Spendly dashboard screenshot shows symptoms that must be checked across the application:

- The spending breakdown's legend/value column is cut off at the right edge of its card.
- Several card headings and compact summary labels are truncated even though space may be recoverable by reflowing the card content.
- The dashboard uses multiple cards in a row; confirm that each card's **internal** layout adapts, not only the outer grid.
- A bottom-left notification/toast occupies substantial space; verify that long messages and notification stacks remain within the viewport and do not obstruct navigation.

Treat these as reproduction clues, not as a confirmed root-cause diagnosis. Inspect the actual implementation before changing it.

## Implementation quality checks

Before considering a screen fixed, confirm all of the following:

- [ ] No unintended horizontal page overflow.
- [ ] No content clipped by cards, containers, sidebars, or viewport edges.
- [ ] All tab labels and actions can be reached.
- [ ] All chart labels, legends, values, and controls remain accessible.
- [ ] Primary actions remain visible and usable.
- [ ] Content order and hierarchy remain sensible at narrow widths.
- [ ] No excessive empty space or unnecessarily tall fixed-height regions.
- [ ] Scrolling works and does not create accidental nested scroll traps.
- [ ] Dialogs, menus, keyboards, and toasts remain inside the visible area.
- [ ] Theme and typography remain consistent.
- [ ] Desktop and Android behavior are both checked where supported.

## Completion report

At the end, provide a concise but complete report containing:

1. The routes and nested tabs audited.
2. The viewport/device sizes actually tested.
3. The root causes found, grouped into shared and screen-specific issues.
4. The files/components changed and the responsive behavior introduced.
5. Tests and builds run, with pass/fail results.
6. Any routes, devices, or viewports not verified and why.
7. Remaining issues, if any.

Never report the entire application as responsive if only a subset of routes or viewport sizes was checked.
