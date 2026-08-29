# Ganesh Seva — UI/UX Redesign

Living document. Records the Expense Tracker design-system audit, the Ganesh Seva
gap analysis, the shared design decisions, and the phase-by-phase change log.

Started 2026-08-24. Branch `claude/ganesh-seva-ui-redesign-f0d468`.

> ## ⚠️ Direction changed 2026-08-29 — read §6 before using §1–§4
>
> Sections 1–4 below describe the **2026-08-24 redesign**, whose stated goal was
> to align Ganesh Seva *to* the Expense Tracker's design system ("there is never
> a second, divergent design system", §3.3).
>
> **That decision has been reversed.** Ganesh Seva is now a Pandal operating
> platform with its own palette, its own surfaces, and its own information
> architecture. §1–§4 remain as the historical record of how the code got to its
> current shape — they are no longer the design brief. See **§6 Redesign II**.

---

## 1. Expense Tracker design system (the reference)

### 1.1 Tokens — `theme/tokens.ts`

| Token group | Source of truth | Notes |
| --- | --- | --- |
| Colors | `lightColors` / `darkColors` + `ACCENT_PALETTES` | 11 named themes, 9 accent palettes; MD3 container roles (`primaryContainer`, `surfaceVariant`, `outlineVariant`, `scrim`) |
| Space | `space` | 4 / 8 / 12 / 16 / 24 / 32 |
| Radius | `radius` | 8 / 12 / 16 / 20 / full / sheet 28 |
| Typography | `typography` (12–28) + `type` MD3 scale | `titleLarge…labelSmall` |
| Fonts | `fontFamily` | Inter 400/500/600/700 |
| Elevation | `elevation[0..5]` | MD3 levels, cross-platform |
| Icon sizes | `iconSize` | 16 / 20 / 24 / 32 |
| Charts | `chart` | categorical ramp + positive/negative |

Icon family: **lucide-react-native**, used everywhere. No emoji, no mixed sets.

### 1.2 The real layout language — `components/dashboard/primitives.tsx`

This file, not `components/ui/Card.tsx`, is what gives the Expense Tracker its
polish. It is the single source of truth for dashboard surfaces:

- `DASH_RADIUS` — `section: 20`, `tile: 14`, `pill: 999` (one radius per role)
- `DASH_SPACE` — `sectionPadding: 16`, `sectionGap: 12`, `rowGap: 10`
- `useSurfaces()` — `tile`, `track`, `divider`, `wash(hex)` low-contrast fills
- `withAlpha(hex, a)` — hex → rgba
- `Section` — the *only* container. Hairline border, **no elevation**, 20dp radius
- `SectionAction` — right-aligned "See all ›"
- `MetaLabel` — 11px uppercase-ish metadata
- `StatTile` — inset tile: label + value + meta
- `DataRow` + `RowGlyph` — 48dp list row, leading glyph, right-aligned value
- `ProgressTrack`, `TrendText`, `StatusStrip`, `Pill`
- `Tone` — the **only** colour vocabulary: `default | muted | positive | negative | warning | accent | info`

### 1.3 Chrome

- `components/layout/PageShell.tsx` — background + `AuraBackground`, safe-area
  aware top/bottom padding derived from `chrome.ts`, `RefreshControl` with haptic
- `components/layout/PageHeader.tsx` — 24px bold title, uppercase tracked subtitle,
  48dp tinted icon tile, pill/underline tab variants
- `components/layout/chrome.ts` — `APP_BAR_CONTENT_HEIGHT 56`, `BOTTOM_NAV_BAR_HEIGHT 64`,
  `BOTTOM_NAV_SCROLL_PADDING 88`, FAB size/gap/edge
- `components/BottomNav.tsx` — 5 destinations max, animated active pill
  (`colors.success` tint), trailing FAB, hides on keyboard

### 1.4 Reusable components already available

`components/common/` — `Amount`, `AnimatedCounter`, `EmptyState` (+illustrations),
`ErrorState`, `LoadingState`, `SuccessState`, `Skeleton`/`SkeletonList`, `Modal`,
`Dialog`, `ListItem`, `SearchBar`, `SwipeableRow`, `OfflineBanner`.

`components/ui/` — `Button` (9 variants, pill, spring press + haptic),
`Input` (52dp min height, floating label, 2px focus ring, error/helper),
`Card`, `AddFab`, `DashboardSkeleton`.

### 1.5 Interaction conventions

- Press feedback: reanimated spring `scale` 0.96 (button) / 0.982 (card)
- Haptics via `lib/haptics` on every press, selection, refresh
- Motion tokens in `theme/motion.ts` (`durations`, `easing`)
- Errors surfaced through `lib/errors` (`friendlyErrorMessage`, `logError`) + `lib/toast`

---

## 2. Ganesh Seva — audit & gap analysis

Screens audited: `app/(ganesh-auth)/login.tsx`, `app/(ganesh)/(tabs)/*`,
`app/(ganesh)/*`, `app/(ganesh)/admin/*`, `components/ganesh/*`.

### 2.1 Findings

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| G1 | High | **No design-system reuse.** Every Ganesh screen inline-styles `backgroundColor: card, borderRadius: 16, padding: 14, borderWidth: 1`. `Section`/`StatTile`/`DataRow` are never imported. | `(tabs)/index.tsx:128`, `(tabs)/collections.tsx:77`, `(tabs)/expenses.tsx:66`, `(tabs)/contributions.tsx:108` |
| G2 | High | **Card overload on Home.** `MetricGrid` renders **15 identical bordered tiles** with no hierarchy — the canonical "AI-generated dashboard" look. | `(tabs)/index.tsx:88-106` |
| G3 | High | **No amount typography scale.** Amounts are `fontWeight: "800"` in `theme.colors.primary` at 18/28/32/36px chosen per screen. No tabular figures. | `GodFundHero.tsx:45`, `MetricGrid.tsx:30`, `collections.tsx:110` |
| G4 | High | **Four separate chip implementations** with identical intent: `ChoiceChips`, `FundLocationChips`, local `ChipRow` in `add-collection.tsx`, and inline filter rows in three tab screens. All use solid `primary` fill for selection — heavy and loud. | `ChoiceChips.tsx`, `FundLocationChips.tsx`, `add-collection.tsx:128`, `collections.tsx:117` |
| G5 | High | **No screen header component.** Each screen hand-rolls `fontSize: 22, fontWeight: "800"` + a sync chip in a flex row. Titles do not match `PageHeader` (24px, -0.5 tracking, uppercase subtitle). | `(tabs)/index.tsx:45`, `collections.tsx:104`, `expenses.tsx:140` |
| G6 | High | **`GaneshScreen` ignores chrome metrics.** Hardcodes `paddingBottom: max(inset,16)+24`; does not use `BOTTOM_NAV_SCROLL_PADDING`, has no `RefreshControl`, no aura, no pull-to-refresh. Tab screens bypass it entirely with a raw `View`. | `GaneshScreen.tsx:19-24` |
| G7 | Med | **Status colours are alarming.** Contribution badges use full-saturation `destructive`/`warning`/`success` backgrounds. A normal pending reimbursement reads as an error. | `contributions.tsx:96-103` |
| G8 | Med | **List rows bury the amount.** Title → amount → meta stacked vertically; no right-aligned value column, so amounts do not scan down the list. | `expenses.tsx:76-99` |
| G9 | Med | **Funding label is a string dump.** `God Fund ₹x · Personal ₹y · Sponsored ₹z · Name` on one wrapped muted line. | `expenses.tsx:194` |
| G10 | Med | **Generic empty states.** Titles only, no illustration, no primary action. `EmptyState` supports all three. | `collections.tsx:175`, `expenses.tsx:209` |
| G11 | Med | **No loading or error states.** Hooks expose `loading`/`error`; screens ignore both and render an empty list. No skeletons anywhere in Ganesh. | all tab screens |
| G12 | Med | **Bottom nav has 6 destinations** vs the Expense Tracker's 5, with no overflow. Labels at 10px. | `GaneshTabBar.tsx:17-24` |
| G13 | Med | **Login is a plain centred `ScrollView`** with a 🙏 emoji and no visual identity, while the Expense Tracker login has a logo, `AuthBackground`, animated entrances and a gradient CTA. | `(ganesh-auth)/login.tsx:158` |
| G14 | Med | **Add Collection exposes 8 fields at once**, 4 of them optional, plus an unstyled member chip row that grows unbounded. | `add-collection.tsx:99-113` |
| G15 | Low | Sync chip is a flat `muted` pill; no relation to `StatusStrip`/`Pill` tone system. | `GaneshSyncChip.tsx:30` |
| G16 | Low | `PermanentFundCard` and `GodFundHero` are two near-identical 24-radius hero cards stacked on Home, competing for the same "primary amount" slot. | `(tabs)/index.tsx:74-87` |
| G17 | Low | No haptics on any Ganesh press target. | all Ganesh components |
| G18 | Low | `AccountabilityLine` embeds `\n` in a single `Text` instead of two styled lines. | `AccountabilityLine.tsx:32` |

### 2.2 What can be reused as-is (do not rebuild)

`Section`, `SectionAction`, `StatTile`, `DataRow`, `RowGlyph`, `MetaLabel`, `Pill`,
`StatusStrip`, `ProgressTrack`, `useSurfaces`, `withAlpha`, `DASH_RADIUS`,
`Button`, `Input`, `AddFab`, `EmptyState`, `ErrorState`, `LoadingState`,
`SkeletonList`, `Modal`, `Dialog`, `SearchBar`, `chrome.ts` metrics, `lib/haptics`,
`lib/errors`, `lib/toast`, `theme/motion`.

### 2.3 What Ganesh genuinely needs that the Expense Tracker lacks

1. A **festival accent** distinct from the user's chosen personal accent colour.
2. A **fund-type vocabulary** — God Fund vs Personal Money vs Permanent Fund —
   that is legible without colour alone.
3. A **money type scale** (hero / primary / row / meta) with tabular figures,
   because Ganesh screens show many amounts per row.
4. **Accountability metadata** (collected by / paid by / entered by / when) as a
   first-class row element.
5. **Offline/pending** affordances at row level.

---

## 3. Ganesh Seva design decisions

### 3.1 Colour

Base palette stays the Expense Tracker's. One festival accent is layered on top,
defined once in `components/ganesh/ui/tokens.ts`:

| Role | Light | Dark | Used for |
| --- | --- | --- | --- |
| `saffron` | `#C2410C` | `#FB923C` | primary festival action, active tab, selected chip, festival header glyph |
| `maroon` | `#7B1D3A` | `#F0A7BE` | Permanent Fund identity only |
| `godFund` | `theme.colors.success` | — | money that belongs to the deity's fund |
| `personal` | `theme.colors.info` | — | money fronted by a member |

Rules:
- Amounts render in `foreground`, never in the accent. The accent marks *actions
  and identity*, not values.
- Status uses `wash()` backgrounds (10–16% alpha) + coloured text, never solid fills.
- Pending reimbursement is `warning` tone, never `destructive`.
- Every status carries a text label, so colour is never the only signal (§35).

### 3.2 Type scale for money — `<Money size>`

| Size | px | Weight | Use |
| --- | --- | --- | --- |
| `hero` | 34 | bold | Available God Fund |
| `title` | 22 | bold | Screen total (Collected, Expenses) |
| `primary` | 17 | semibold | Row amount |
| `secondary` | 14 | medium | Split / breakdown amount |
| `meta` | 12 | medium | Estimated, pending |

All use `fontVariant: ["tabular-nums"]` so columns align.

### 3.3 Structure

One container (`Section`), one row (`LedgerRow`), one chip (`FilterChips`), one
badge (`StatusBadge`), one header (`GaneshHeader`), one screen shell
(`GaneshScreen`). No screen defines its own card style.

---

## 4. Phase log

### Phase 1 — Foundations, Login, Home, Collections, Expenses, Contributions

Status: **complete** (2026-08-24)

New shared module `components/ganesh/ui/`:

| File | Purpose |
| --- | --- |
| `tokens.ts` | `useGaneshTokens()` — festival accent, fund tones, radius/space re-export |
| `Money.tsx` | `<Money>` amount type scale, tabular figures, tone support |
| `FilterChips.tsx` | single chip row — replaces 4 implementations (G4) |
| `StatusBadge.tsx` | washed status pill with mandatory text label (G7) |
| `LedgerRow.tsx` | transaction row: glyph, title, meta, right-aligned amount, accountability, pending hint (G8, G9, G18) |
| `FundHero.tsx` | fund hero with location breakdown — one per screen (G3, G16) |
| `GaneshHeader.tsx` | screen header matching `PageHeader` metrics (G5) |
| `GaneshMark.tsx` | the app's only festival illustration — pandal arch + lotus, single weight, one colour |
| `GaneshAuthBackground.tsx` | login backdrop, structurally identical to `AuthBackground` with saffron/maroon hues |
| `ListStateView.tsx` | one `ListEmptyComponent` covering loading skeleton / error+retry / empty+action (G10, G11) |
| `index.ts` | barrel; re-exports the shared dashboard primitives so screens have one import site |

Rewritten:
- `components/ganesh/GaneshScreen.tsx` — chrome-aware, refreshable, skeleton/error aware (G6, G11)
- `components/ganesh/GaneshTabBar.tsx` — 5 destinations + animated active pill (G12)
- `components/ganesh/GaneshSyncChip.tsx` — tone-based (G15)
- `components/ganesh/GaneshQuickActions.tsx` — `Section` + `DataRow` grid
- `components/ganesh/ChoiceChips.tsx`, `FundLocationChips.tsx` — delegate to `FilterChips`
- `components/ganesh/AccountabilityLine.tsx` — two-line, styled (G18)
- `components/ganesh/GodFundHero.tsx`, `PermanentFundCard.tsx`, `MetricGrid.tsx` — rebuilt on the new primitives (G2, G16)
- `app/(ganesh-auth)/login.tsx` (G13)
- `app/(ganesh)/(tabs)/index.tsx` (G1, G2, G16)
- `app/(ganesh)/(tabs)/collections.tsx` (G1, G8, G10, G11)
- `app/(ganesh)/(tabs)/expenses.tsx` (G1, G8, G9, G10, G11)
- `app/(ganesh)/(tabs)/contributions.tsx` (G1, G7, G10, G11)

**Navigation change.** The bottom bar went from six destinations to five: Home,
Collections, Expenses, Contributions, Pandal. **Committee** moved one tap inside
Pandal, which already linked to it — Pandal is the app's "more" surface
(committee, assets, sponsors, permanent fund, admin, settings). Six evenly-split
destinations forced 10px labels; five match the Expense Tracker exactly. The
route itself is unchanged, so every existing `/(ganesh)/committee` link still works.

**Verification.** `npx tsc -p tsconfig.json --noEmit` clean;
`npm test` 1221 tests / 125 files passing.

### Phase 2 — Admin, Members, Roles, Permanent Fund, Assets, Sponsors

Status: **complete** (2026-08-25)

#### Additional findings (Phase 2 audit)

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| G19 | Critical | **The Admin Dashboard rendered 31 navigation cards across 7 groups, with heavy duplication.** Members appeared 4× ("Members" in Quick actions, "Manage members" in User management, "Members" in People, "Approve members"); Permanent Fund, Festivals, Contribution setup, Sponsors and Reports each appeared 3×. Collections/Expenses/Contributions duplicated the bottom nav. Three separate `MetricGrid`s stacked 12 tiles above it. | `admin/index.tsx` (pre-redesign, lines 192–397) |
| G20 | High | **`AdminLinkRow` made every menu entry its own bordered card**, so a menu of 31 destinations read as 31 pieces of content. | `AdminLinkRow.tsx:29-36` |
| G21 | High | **Permission editing was a flat wall of pill chips** — the exact "ugly giant list of checkboxes" the brief forbids (§20). No per-group count, no indication which permissions are sensitive. | `PermissionChecklist.tsx:45-71` |
| G22 | High | **`PermissionSummary` printed ✓/✗ for every permission in every group**, including all the denied ones — dozens of lines of noise to read one role. | `PermissionChecklist.tsx:106-111` |
| G23 | High | **`AddFab` was a plain flex child on 4 screens**, so the "floating" action button rendered inline at the bottom of the column instead of floating. | `assets.tsx:191`, `sponsors.tsx:242` (pre-redesign) |
| G24 | Med | **Ganesh Stack screens used native headers** while the Expense Tracker uses `headerShown: false` everywhere with an in-content `PageHeader`. | `(ganesh)/_layout.tsx:82-114`, vs `(app)/_layout.tsx:45` |
| G25 | Med | **Member detail was one 180-line ungrouped column** — roles, permissions, admin controls, target editing and payment history with no sectioning. | `member/[id].tsx:128-307` (pre-redesign) |
| G26 | Med | **Role assignment used `☑`/`☐` text glyphs** as checkboxes. | `member/[id].tsx:161` (pre-redesign) |
| G27 | Med | **Sponsors exposed three chip rows at once** (status, type, purpose) above the list. | `sponsors.tsx:185-195` (pre-redesign) |
| G28 | Med | **Asset and sponsor detail put every edit form on screen permanently**, with no view/edit distinction. | `asset/[id].tsx:215-319`, `sponsor/[id].tsx:213-233` (pre-redesign) |
| G29 | Low | **Asset audit rows rendered raw snake_case action keys** (`quantity_adjusted`) as the row title. | `asset/[id].tsx:390` (pre-redesign) |
| G30 | Low | Committee, members and assets lists had no loading, error or search-empty states. | `committee.tsx`, `members.tsx`, `assets.tsx` (pre-redesign) |

#### New kit components

| File | Purpose |
| --- | --- |
| `ui/NavRow.tsx` | grouped-navigation row — glyph, title, meta, badge, chevron; replaces the bordered-card menu (G19, G20) |
| `ui/Avatar.tsx` | initials avatar on a deterministic non-semantic tint ramp (green and red excluded, so a person never reads as "good" or "bad") |

`LedgerRow` gained an optional `amount` and `iconTint="none"`, so it can carry a
person or an inventory item as well as a transaction.

#### Rewritten

- `components/ganesh/AdminLinkRow.tsx` — delegates to `NavRow` (G20)
- `components/ganesh/AdminQueryState.tsx` — skeleton / error+retry / empty via the shared components (G30)
- `components/ganesh/PermissionChecklist.tsx` — one `Section` per capability area with a running "n of m allowed" count, a bulk toggle, real checkboxes, and a `Sensitive` text tag on `CRITICAL_PERMISSIONS`; `PermissionSummary` now shows only what is granted plus an "n not allowed" line (G21, G22)
- `app/(ganesh)/admin/index.tsx` — **31 cards → 4 metric tiles + 5 grouped sections (14 rows)**; every duplicate collapsed, tab-bar destinations dropped (G19)
- `app/(ganesh)/(tabs)/pandal.tsx` — the "more" surface, rebuilt on `Section` + `NavRow`
- `app/(ganesh)/(tabs)/committee.tsx` — avatar rows with a per-person progress track and an inline "Record payment" affordance
- `app/(ganesh)/members.tsx` — search, role filters, avatar rows, member-changes log
- `app/(ganesh)/join-requests.tsx` — avatar cards with role chips before approval
- `app/(ganesh)/admin/roles/{index,new,[id]}.tsx` — built-in vs custom grouping, grouped permission editing
- `app/(ganesh)/member/[id].tsx` — profile hero + sectioned festival stats, roles, permissions, target, access controls, payment history (G25, G26)
- `app/(ganesh)/permanent-fund.tsx` — maroon hero, per-festival took/returned grid, "Move money" as one chip-selected form
- `app/(ganesh)/assets.tsx` + `asset/[id].tsx` — inventory rows with quantity in the value column; detail gains a view/edit split and prose audit labels (G28, G29)
- `app/(ganesh)/sponsors.tsx` + `sponsor/[id].tsx` — status chips always visible, type/purpose behind "More filters" (G27); detail gains a deal picker, linked-records block, and a view/edit split (G28)
- `app/(ganesh)/admin/{festivals,reports}.tsx` — nav rows wrapped in a `Section` so they keep a surface (full redesign deferred to Phase 3)

#### Navigation

Every Phase 1 and Phase 2 screen now uses `headerShown: false` with an
in-content `GaneshHeader`, matching the Expense Tracker exactly (G24). Screens
not yet converted keep their native header, so the two styles never collide on
one screen.

#### Verification

`npx tsc -p tsconfig.json --noEmit` clean; `npm test` 1221 tests / 125 files passing.

### Phase 3 — Reports, Settlement, Settings, secondary screens

Status: not started

Remaining: `report.tsx`, `admin/{reports,audit,categories,festivals,settings,setup}.tsx`,
`setup.tsx`, `create-festival.tsx`, `close-festival.tsx`, the ten `add-*` forms
(including the Add Collection fast-entry rework from §11), and the
`expense/[id]`, `contribution/[id]`, `household/[id]` detail screens. Then the
cross-app consistency audit (§33) and the admin/member walkthrough (§39).

---

## 5. Functional issues found while redesigning

No financial calculation, God Fund / Personal Money / reimbursement /
Permanent Fund logic, RBAC rule, Firestore rule, data model or storage path was
touched (§38). Two defects were in **list display filtering** — presentation, not
business logic — and were corrected as part of rebuilding those screens:

1. `app/(ganesh)/(tabs)/collections.tsx` — when the filter was `cash`/`upi`, the
   search term was ignored: the payment-method branch returned before the name
   test ran, so typing a donor name inside a method filter did nothing.
   **Fixed** — method and search predicates are now independent.
2. `app/(ganesh)/(tabs)/expenses.tsx` — the `pending` and `personal` filter chips
   applied the identical predicate (`expense.personalAmount > 0`), so "Pending"
   was a duplicate that could never surface only unreimbursed spends.
   **Removed** the duplicate chip and replaced it with an `Assets` filter
   (`isAssetPurchaseExpense`), which had no filter of its own despite being a
   headline metric on the same screen.

Still open, and **deliberately not changed** because a correct fix needs a
business-logic decision:

3. There is no "unreimbursed personal money" predicate anywhere in the expense
   list. Surfacing it needs a `personalAmount - reimbursedAmount > 0` rule and a
   decision about where the reimbursed-per-expense figure comes from
   (`GaneshExpense` carries no `reimbursedAmount`; only the festival-level
   `summary.pendingReimbursements` exists). Flagged for the owner.

---

# 6. Redesign II — Pandal operating platform (2026-08-29)

Branch `claude/ganesh-seva-redesign-1372fa`.

## 6.1 Why the direction changed

Redesign I made Ganesh Seva a well-built *sibling* of the Expense Tracker. The
problem is that being a sibling of an expense tracker is exactly what this
product should not be. Three findings from the 2026-08-29 audit:

| # | Finding | Evidence |
| --- | --- | --- |
| R1 | **No theme of its own.** `theme/` had zero Ganesh awareness, so the app rendered in whatever theme + accent the user picked in the Expense Tracker (default indigo). The entire festival identity was one saffron accent. | `theme/tokens.ts` (no Ganesh entries), `components/ganesh/ui/tokens.ts` |
| R2 | **Money owned the navigation.** 3 of 5 bottom tabs were ledgers (Collections, Expenses, Contributions); Home led with a fund balance and two money tiles. | `GaneshTabBar.tsx`, `(tabs)/index.tsx` |
| R3 | **Every surface was an Expense Tracker surface.** `Section`, `StatTile`, `DataRow`, `RowGlyph`, radii and spacing were re-exported from `components/dashboard/primitives`. | `components/ganesh/ui/index.ts` |

Guiding principle for Redesign II: **Seva first. Pandal operations second. Money
as an important supporting system — not the identity of the product.**

## 6.2 Scope decisions (confirmed with the owner)

1. **Seva Schedule + volunteer duty assignment will be built.** Neither existed
   in any form — no types, hooks, services, screens or Firestore rules. This is
   the only part of the redesign that adds backend surface.
2. **Fixed festival palette, light + dark.** Ganesh ignores the Expense accent:
   a pandal's app should look the same to every committee member.
3. **Wider responsive layout, no desktop sidebar.** Bottom nav stays at all sizes.

## 6.3 Phase 1 — design-system foundation

Status: **complete** (2026-08-29)

### Palette

`theme/ganeshPalette.ts` (new) — a full `ColorTokens` pair, not an accent overlay.

| Role | Light | Dark |
| --- | --- | --- |
| `background` | `#FDF8F0` warm ivory | `#171009` |
| `card` | `#FFFFFF` | `#211711` |
| `foreground` | `#241609` | `#F6EDE2` |
| `mutedForeground` | `#7A6A5F` | `#B8A697` |
| `primary` (saffron) | `#C2410C` | `#FB923C` |
| `border` | `#EADFCF` | `#33251C` |
| `success` / `warning` / `destructive` | `#1F7A4D` / `#B45309` / `#B3261E` | `#4ECB8B` / `#F0B045` / `#F2635A` |

Non-`ColorTokens` festival values stay in `components/ganesh/ui/tokens.ts`:
maroon (`#7B1D3A` / `#F0A7BE`, Permanent Fund only) and gold (`#B98029` /
`#E0B558`, section rules and the hero arch only).

Note: `secondary` and `muted` are **surfaces** in this token system, not brand
colours — components fill chips and inset tiles with them. They are warm
neutrals here; putting maroon there would have broken every chip in the app.

### Delivery mechanism

`providers/GaneshThemeProvider.tsx` (new) republishes `ThemeContext` for the
Ganesh subtree. Because `useTheme()` reads a context, **every one of the ~10,000
lines of existing Ganesh screens picks up the new palette with no per-screen
edit**, and nothing outside `app/(ganesh*)` can see it. Mounted at the top of
`app/(ganesh)/_layout.tsx` and `app/(ganesh-auth)/_layout.tsx`.

The only change to a shared file is `theme/ThemeProvider.tsx`, which now exports
its `ThemeContext` (previously module-private). Purely additive — no behaviour
change for Expense or Nutrition.

### Surfaces forked

`components/ganesh/ui/surfaces.tsx` (new) owns `Section`, `SectionAction`,
`StatTile`, `DataRow`, `RowGlyph`, `MetaLabel`, `Pill`, `StatusStrip`,
`ProgressTrack`, `TrendText`, `useSurfaces`, `toneColor`, `GANESH_RADIUS`,
`GANESH_SPACE`. `components/ganesh/ui/index.ts` re-points to it, so **no screen
import changed**. Nothing under `components/ganesh/` imports
`components/dashboard/` any more.

What deliberately differs from the Expense primitives:

- **Warm surfaces** — tile/track washes mixed from the palette's ink brown
  (`rgba(36,22,9,...)`), not slate. A slate wash on ivory reads grey-blue and
  instantly looks like a finance app.
- **Softer geometry** — section radius 18 (was 20), tile 12 (was 14).
- **Squircle glyph niches** instead of circles, closer to a temple niche.
- **A gold hairline rule** under section headers — the one piece of decoration
  in the system, header only, never repeated inside a section.
- **`accent` means the festival colour.** The Expense version hardcodes
  `ACCENT_PURPLE`, which belongs to the Vault feature and has no meaning here.
- **52dp rows** (was 48dp) — the app is used standing, in a crowd, one-handed.

### New components

| File | Purpose |
| --- | --- |
| `ui/ArchFrame.tsx` | Mandap arch along a hero's top edge, gold at low opacity. **Hero surfaces only** — never a list card, or the app becomes a festival poster. |
| `ui/GaneshEmptyState.tsx` | Seva-appropriate empty states. Separate from `common/EmptyState`, which carries finance illustrations and a "Pro Tip" card. Copy rule: never "No data found". |
| `ui/SevaGlyph.tsx` | One lucide icon + label per `SevaKind`. No emoji — they render differently per Android skin and ignore colour. |

### Types added (consumed by Phase 2)

`shared/types/ganesh.ts` gained `SevaKind`, `SevaStatus`, `DutyStatus`,
`FestivalSeva`, `SevaDuty`, and optional `Festival.startDate` / `endDate`.
A seva carries **no money fields** and never enters `GaneshSummary`, any ledger,
or the God Fund; money spent on an activity remains a `GaneshExpense`.

### Defect fixed: God Fund asset purchases threw

`services/ganesh/ganeshWrites.ts:1702` — inside `addAssetPurchase`, the
`appendAssetPurchase(writer)` closure called
`appendPandalAssetCreate(batch, ...)`, referencing the `const batch` declared 56
lines below it. The God Fund path invokes that closure inside `runTransaction`
**before** the `const` initialises, so **every asset purchase paid even partly
from the God Fund failed with `ReferenceError: Cannot access 'batch' before
initialization`**, and the asset row never joined the transaction. The
personal/sponsored path worked only by accident of ordering.

Pre-existing and unrelated to the redesign, but fixed here because it breaks the
Asset-vs-Expense distinction. One word: `batch` to `writer`.

New `services/ganesh/ganeshAssetPurchase.write.test.ts` drives the real function
against a faked Firestore and asserts both paths write the expense *and* the
asset through the same writer. Verified to fail against the original code
(reproducing the exact `ReferenceError`) and pass with the fix. These are the
**first tests to cover `ganeshWrites.ts`**, which is 2355 lines and previously
had none; the pattern (mock `firebase/firestore`, `@/lib/firestoreWrite` and
`@/lib/id`) is reusable for the rest of the file.

## 6.4 Functionality preserved

No change to money math, promised/received logic, the God Fund / Personal Money
/ Permanent Fund model, reimbursements, the `expenseType` discriminator, RBAC,
Firestore rules, storage paths, or any route. Phase 1 changes colour, surfaces
and types only — plus the one-word correctness fix above.

## 6.5 Verification (Phase 1)

- `npx tsc -p tsconfig.json --noEmit` — clean
- `npx tsc -p tsconfig.shared.json --noEmit` — clean
- `npm test` — **127 files / 1280 tests passing** (was 126 / 1278; +2 new)
- Ganesh does not leak: grepping `components/ganesh`, `GaneshThemeProvider` and
  `ganeshPalette` across `app/` and `components/` returns nothing outside
  `components/ganesh/` and `app/(ganesh*)`
- Ganesh is fully forked: grepping `dashboard/primitives` across the Ganesh tree
  returns only the explanatory comment in `surfaces.tsx`
- Only shared file touched is `theme/ThemeProvider.tsx`, and only to add `export`

## 6.7 Phase 2 — Seva schedule + volunteer duties (backend)

Status: **complete** (2026-08-29). Not yet user-visible — the screens land in Phase 3.

This is the only phase that adds backend surface. Everything is additive: no
existing collection, rule, permission or write path changed behaviour.

### The model

A **seva** is an activity the committee runs — morning aarti, annadanam, a
cultural programme, the visarjan procession. A **duty** is one volunteer on one
seva.

The load-bearing decision: **a seva is not a financial record.** It carries no
amount, never enters `GaneshSummary`, any ledger, or the God Fund. Money spent
on an activity remains a `GaneshExpense` exactly as before. This is enforced in
three places rather than trusted:

1. `FestivalSeva` / `SevaDuty` declare no money fields.
2. `sevaCarriesNoMoney()` in `firestore.rules` rejects any write to a seva or
   duty document carrying `amount`, `totalAmount`, `godFundAmount`,
   `personalAmount`, `sponsoredAmount`, `estimatedValue` or `ledgerType`.
3. A contract test asserts a holder of `seva.write` cannot reach any money
   write helper.

Point 2 matters because nothing reads those keys *today*. Without the guard, a
later summary or report that started reading them would be spending money
authorised by the wrong permission.

### Storage

```
pandals/{p}/festivals/{f}/seva/{sevaId}
pandals/{p}/festivals/{f}/seva/{sevaId}/duties/{dutyId}
```

Duties are a subcollection rather than an array on the seva document so two
coordinators staffing the same aarti do not overwrite each other. `dutyCount` on
the seva is denormalised for list rendering only; `dutyCounts()` over the real
duties is the source of truth wherever it matters.

Dates are ISO `yyyy-mm-dd` and times 24-hour `HH:mm`, compared lexically —
the same choice `GaneshContribution.expectedDate` already makes. No `Date`
objects and no timezone maths anywhere in the schedule: a pandal's programme is
local wall-clock time, and routing it through UTC is how an aarti lands on the
wrong day.

### Permissions

Three new keys in `ALL_GANESH_PERMISSIONS`, the registry (as a grantable
"Seva schedule" group), and `PERMISSION_DEPENDENCIES`:

| Key | Who has it by default |
| --- | --- |
| `seva.read` | every role, including viewer — a volunteer who cannot read the schedule cannot turn up |
| `seva.write` | admin, treasurer |
| `seva.assign` | admin, treasurer |

`SEVA_ROLE_DEFAULTS` + `hasSevaPermission()` extend the existing backfill in
`ensurePandalRoles`, so a pandal that already has role and member documents
gains the new keys on next load — the same migration path assets and sponsors
used. Without it an existing treasurer would see the schedule and get a bare
permission-denied when planning one.

**One volunteer self-service carve-out.** The `duties` update rule lets the
assignee change their own duty — "I am here", "done" — without holding
`seva.assign`, restricted via `affectedKeys().hasOnly(['status','updatedBy','updatedAt'])`
so it cannot be used to reassign the duty to somebody else. `setDutyStatus`
writes exactly those three keys to stay inside that gate.

### The contract test caught a real mismatch

`firestore.rules` duplicates the member permission set as a literal in
`builtinMemberPermissions()`, mirrored in the test as
`RULE_BUILTIN_MEMBER_PERMISSIONS`. Adding `seva.read` to the member role made
the two disagree, and the alignment test failed exactly as intended. Both
literals were updated. Left unfixed, an open-join self-created membership
writing the correct member permission set would have been rejected by the rules.

### Files

| File | Change |
| --- | --- |
| `shared/utils/ganeshSeva.ts` + `.test.ts` | **new** — selection, festival-window maths, duty counts, transition guards, validation. **42 tests** |
| `shared/types/ganesh.ts` | `FestivalSeva`, `SevaDuty`, `pendingWrite`, optional `Festival.startDate`/`endDate` |
| `shared/utils/ganeshPaths.ts` | `seva` subcollection + `sevaDutiesCol()` |
| `shared/utils/ganeshPermissions.ts` | 3 permissions, role maps, `RULE_SEVA_WRITE_ROLES`, `SEVA_ROLE_DEFAULTS` |
| `shared/utils/ganeshPermissionRegistry.ts` | grantable "Seva schedule" group + dependencies |
| `shared/utils/ganeshPermissions.rules.contract.test.ts` | seva rule mirrors, **13 new tests** |
| `firestore.rules` | `canPlanSevaOf` / `canAssignSevaOf` / `canWriteSevaOf`, `seva` in the subcollection allowlist, seva status enum, `sevaCarriesNoMoney()`, nested `duties` match |
| `services/ganesh/ganeshSeva.ts` | **new** — `createSeva`, `updateSeva`, `setSevaStatus`, `voidSeva`, `assignDuty`, `removeDuty`, `setDutyStatus` |
| `services/ganesh/ganeshRoles.ts` | seva backfill for existing role and member docs |
| `services/ganesh/ganeshWrites.ts` | optional festival window on create/update + `assertFestivalWindow` |
| `hooks/useFestivalSeva.ts` | **new** — `useFestivalSeva`, `useSeva`, `useSevaDuties` |
| `hooks/useGaneshWrites.ts` | seva writes behind `requirePerm` |

### Design notes

- **No online gate on any seva write.** Every path is a plain `writeBatch`
  because none reads a balance, so planning and staffing work with no signal at
  the pandal — which is exactly when a schedule gets changed. The money paths
  keep their transaction + online gates untouched.
- **A seva is soft-removed** (`voided`), like every other Ganesh record, so a
  finished festival's schedule still reconciles with what people remember.
  **A duty is hard-deleted** — taking a volunteer off an aarti reverses no
  balance and leaves nothing to reconcile.
- `updateSeva` writes `""` rather than omitting cleared optional fields, because
  `omitUndefined` would silently keep the old value.

### Verification (Phase 2)

- `npx tsc -p tsconfig.json --noEmit` and `tsconfig.shared.json` — clean
- `npm test` — **128 files / 1334 tests passing** (was 127 / 1280)
- `ganeshPermissions.rules.contract.test.ts` — 65 tests, the gate for this phase

**Not verified locally: `firestore.rules` does not compile anywhere in this
environment.** `firebase deploy --dry-run` needs project credentials, and
`firebase emulators:exec` requires JDK 21 (this machine has 17). The rules were
reviewed by hand against the existing helpers and mirrored in the contract test,
but the mirror is hand-written and proves consistency, not syntax. **Compile the
rules before deploying** — see §6.9.

## 6.8 Remaining phases

3. Command Center + navigation — 5 new tabs, Home rebuilt, seva screens
4. Funds / People / Pandal
5. Reports, forms, responsive, polish

## 6.9 Deploy checklist

`firestore.rules` is **not deployed by CI** (see `docs/FIREBASE_RULES_DEPLOY.md`).
The seva rules must be compiled and deployed *before or with* the client that
writes seva, or every seva write returns permission-denied:

```bash
firebase deploy --only firestore:rules
```

That command compiles the rules first, which is also the syntax check this
environment could not run.
