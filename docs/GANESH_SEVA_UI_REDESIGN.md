# Ganesh Seva — UI/UX Redesign

Living document. Records the Expense Tracker design-system audit, the Ganesh Seva
gap analysis, the shared design decisions, and the phase-by-phase change log.

Started 2026-08-24. Branch `claude/ganesh-seva-ui-redesign-f0d468`.

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
