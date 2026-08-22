# Settings & Preferences Audit — 2026-08-22

Scope: every user-facing control under `app/(app)/settings/*` traced end to end —
UI control → setter → Firestore write → merge on read back → the code that
actually consumes the value. The question asked was "some settings are not fully
implemented and those preference values aren't saving properly" — so this pass
separates three distinct failure modes that all look identical to a user:

1. **Dead preference** — the chip/switch works, the value saves to Firestore, and
   nothing in the app ever reads it.
2. **Unsavable value** — the UI offers a state the persistence layer refuses to
   store, so it snaps back on the next snapshot.
3. **Partially honoured** — some screens read the preference and others use a
   hardcoded value or a different source, so the app contradicts itself.

Diagnostic only. No fixes applied in this pass.

Sections reviewed: Profile, Appearance, Preferences, Categories & money,
Accounts, Automation, Privacy & security, About — plus `SettingsProvider`,
`SystemSettingsProvider`, `AppThemeProvider`, `LocalizationProvider`, and
`shared/types/settings.ts`.

---

## Findings

### P1-1 — `firstDayOfWeek` is written and never read

**What.** Settings → Preferences → "First Day of Week" offers Monday/Sunday,
persists through `setFirstDayOfWeek`, and `mergeSettingsFromDoc` even has a
dedicated fallback branch for it. Grep for `firstDayOfWeek` outside
`shared/types/settings.ts`, `providers/SettingsProvider.tsx`, and the picker
itself returns nothing — there is no consumer anywhere in `app/`, `components/`,
`hooks/`, `shared/utils/`.

**Why it matters.** It is the only preference in the panel whose entire
implementation is the picker. Week-boundary logic exists in the app
(`shared/utils/smartInsights.ts` week totals, analytics grouping) and all of it
uses whatever the underlying `Date`/`Intl` default is.

**Failure scenario.** A user in the US sets First Day of Week to Sunday. Every
weekly figure in Insights continues to be computed on the old boundary. Nothing
in the UI changes, so the user reasonably concludes the setting is broken —
it is.

Files: [PreferencesSection.tsx:245](components/settings/sections/PreferencesSection.tsx:245),
[settings.ts:75](shared/types/settings.ts:75)

---

### P1-2 — `dateFormat` only affects the Settings preview card

**What.** Settings → Preferences → "Date Format" offers four formats. The only
code that branches on `settings.dateFormat` is
`PersonalizationPreviewCard.formatDatePreview()` — the mock row rendered inside
the Appearance section as a *preview*. Every real date in the app is rendered
with a hardcoded locale or the device default:

- [ExpenseList.tsx:187](components/ExpenseList.tsx:187) — `toLocaleDateString("en-US", …)`
- [dashboard.tsx:87](app/(app)/dashboard.tsx:87) — `toLocaleDateString("en-US", …)`
- [MonthlyAnalyticsView.tsx:90](components/analytics/MonthlyAnalyticsView.tsx:90) — `toLocaleDateString(undefined, …)`
- the `(nutrition)` screens — `toLocaleDateString(undefined, …)`

**Why it matters.** This is the most convincing kind of broken setting, because
the preview card *does* update. The user sees immediate visual confirmation the
preference took effect, then finds every actual date unchanged.

**Failure scenario.** User picks `DD/MM/YYYY`. The preview row switches to
`22/08/2026`. The expense list still reads `Aug 22, 2026`. The value is
correctly saved in Firestore the whole time.

Files: [PersonalizationPreviewCard.tsx:33](components/settings/PersonalizationPreviewCard.tsx:33)

---

### P1-3 — `language` translates only the Settings screen; RTL is never applied

**What.** `LocalizationProvider` ships a full 7-language `TRANSLATIONS` table
(en, hi, es, fr, de, ja, ar) and a `t()` helper. `useTranslation` is imported by
exactly three files, all of them Settings UI:
`PersonalizationPreviewCard.tsx`, `sections/AppearanceSection.tsx`,
`sections/PreferencesSection.tsx`. The rest of the app — navigation labels,
dashboard, ledger, every modal — is hardcoded English string literals.

Separately, the provider computes `isRTL` from the selected language
([LocalizationProvider.tsx:462](providers/LocalizationProvider.tsx:462)) and
exposes it on the context, but no consumer reads it. No `I18nManager` call, no
`direction`/`writingDirection` style anywhere.

**Why it matters.** The picker presents seven languages as equals. Selecting any
of them changes a handful of labels on two Settings screens and nothing else.
Arabic additionally renders left-to-right with Arabic text, which is worse than
not offering it.

**Failure scenario.** User selects हिन्दी. A toast says "Language updated". Four
field labels on the Preferences screen change. The entire rest of the app stays
English. The preference is saved and reloads correctly, so nothing looks like a
persistence failure — it is a coverage failure.

---

### P1-4 — `defaultView: "add"` silently resolves to Dashboard

**What.** The Default view chip row offers four options: Dashboard, Expenses,
Analytics, **Add**. The router entry point only branches on two of them:

```
app/(app)/index.tsx
  defaultView === "expenses"  → /ledger
  defaultView === "analytics" → /insights
  (everything else)           → /dashboard
```

**Why it matters.** "Add" is a real destination in this app (it is a nav tab).
Offering it as a startup view and then ignoring it is a one-line gap in a
four-line file.

**Failure scenario.** User sets Default view to Add, force-quits, relaunches, and
lands on Dashboard. The chip still reads Add — the value saved fine.

Files: [index.tsx:7](app/(app)/index.tsx:7),
[PreferencesSection.tsx:169](components/settings/sections/PreferencesSection.tsx:169)

---

### P1-5 — the `hapticFeedback` toggle governs a small minority of vibrations

**What.** `lib/haptics.ts` is the intended gate: `haptic.setEnabled()` is wired
from `SettingsProvider` ([SettingsProvider.tsx:87](providers/SettingsProvider.tsx:87))
and every `haptic.*` method early-returns when disabled. But 80 files import
`expo-haptics` directly, for **184 raw `Haptics.selectionAsync` /
`impactAsync` / `notificationAsync` call sites** that never consult the
preference.

The three Settings components that own the toggle are themselves among the
offenders:

- [SettingsSubmenus.tsx:158](components/settings/SettingsSubmenus.tsx:158) — widget toggles
- [CreditCardBillReminderSettings.tsx:22](components/settings/CreditCardBillReminderSettings.tsx:22) — day pills
- [SettingsControls.tsx:140](components/settings/SettingsControls.tsx:140) — `ChipRow`

`SettingsControls.tsx` is the sharpest illustration: line 85 goes through
`haptic.selection()` (respects the preference) and line 140 calls
`Haptics.selectionAsync()` directly (ignores it) — in the same file.

**Why it matters.** This is the setting most likely to be reported as "not
working", because the user tests it immediately and the very next control they
touch still buzzes.

**Failure scenario.** User turns Haptic feedback off. The "Test vibration
patterns" buttons correctly go silent (they use `haptic.*`). Then they tap a
chip in the same panel and it vibrates.

---

### P1-6 — "no pre-due bill reminders" cannot be saved

**What.** `CreditCardBillReminderSettings` lets the user toggle each of the
`7d / 3d / 1d before` pills independently, including deselecting all three,
which writes `daysBefore: []` to Firestore. `mergeSettingsFromDoc` then treats
an empty array as absent and substitutes the default:

```ts
// shared/types/settings.ts
daysBefore:
  Array.isArray(remindersSource?.daysBefore) && remindersSource.daysBefore.length > 0
    ? (remindersSource.daysBefore as number[])
    : SETTINGS_DEFAULTS.creditCardBillReminders.daysBefore,   // [7, 3, 1]
```

**Why it matters.** This is a genuine "the value isn't saving" bug, and it is the
only one of its kind found in this pass. The `.length > 0` guard is there to
defend against a malformed doc, but it cannot distinguish "field missing" from
"user deliberately chose none", so it overrides intent.

**Failure scenario.** User wants only the on-due-date reminder. They deselect
7d, then 3d, then 1d. As the last one is deselected the write lands, the
listener fires, the merge restores `[7, 3, 1]`, and all three pills light back
up in front of them. There is no way to reach the state the UI clearly offers.

Files: [settings.ts:290](shared/types/settings.ts:290),
[CreditCardBillReminderSettings.tsx:24](components/settings/CreditCardBillReminderSettings.tsx:24)

---

### P2-1 — currency is read from two different sources depending on the screen

**What.** Three different notions of "the currency" are live at once:

| Consumer | Source |
| --- | --- |
| `Amount`, `AccountBalanceCard`, `PortfolioSummaryCard` | `settings.currency` (the user preference) |
| `MoneySection` budget toast + helper text | `system.defaultCurrency` (the admin-wide default) |
| `services/sms/smsNotificationCopy.ts:32` | hardcoded `"INR"` |

**Why it matters.** The Preferences panel presents "Preferred Currency" as the
user's choice and even subtitles the panel with `System currency: {X}` — so the
two concepts are visibly distinct in the UI, and then the money screen uses the
wrong one.

**Failure scenario.** User sets Preferred Currency to USD. Dashboard totals
switch to `$`. They then set a monthly budget and the confirmation toast reads
`Monthly budget saved · ₹30,000`, and the field's helper text under it reads
`Saved in your account: ₹30,000`. SMS-detected transaction notifications also
stay in `₹` regardless.

Files: [MoneySection.tsx:63](components/settings/sections/MoneySection.tsx:63),
[MoneySection.tsx:117](components/settings/sections/MoneySection.tsx:117),
[smsNotificationCopy.ts:32](services/sms/smsNotificationCopy.ts:32)

---

### P2-2 — `numberFormat` reaches only three components

**What.** `formatAmount`/`formatAmountNumber` accept `numberFormatStyle`, but
only three call sites pass it: `components/common/Amount.tsx`,
`components/accounts/AccountBalanceCard.tsx`,
`components/portfolio/PortfolioSummaryCard.tsx`. Every other `formatAmount`
call — budget labels, `smartInsights`, `splitClaims`, `splitPublicShare`,
`ReconcileStatementModal`, `PublicSplitClaimRow` — omits it and therefore
silently falls back to `"auto"` (locale derived from the currency code).

**Why it matters.** Same class as P2-1: the preference works in the highest
traffic component, which makes the places it doesn't reach read as a rendering
bug rather than an unimplemented option.

**Failure scenario.** User with INR selects "Standard (1,000,000)". Dashboard
amounts switch to `1,000,000`. The Insights weekly-spend sentence still says
`10,00,000`.

---

### P2-3 — `SETTINGS_DEFAULTS.currency` ignores the system default

**What.** `SETTINGS_DEFAULTS.currency` is the literal `"INR"`. A new user's
effective currency is therefore INR regardless of what
`system_settings/global.defaultCurrency` says — and the Preferences panel
displays that system value directly above the picker.

**Failure scenario.** Admin sets the system default currency to USD. A new user
signs up, and the Defaults panel reads `System currency: USD` while every amount
renders in `₹` and the Preferred Currency chip shows INR selected.

Files: [settings.ts:210](shared/types/settings.ts:210)

---

### P2-4 — changing currency in Settings does not tick the setup checklist

**What.** `onboarding.currencyChosen` exists specifically to distinguish
"user confirmed a currency" from "currency defaulted" — the comment on the field
says so. It is set in exactly one place,
[SetupWizardModal.tsx:147](components/onboarding/SetupWizardModal.tsx:147). The
Preferences currency picker calls `setCurrency` only.

**Failure scenario.** User skips the setup wizard, goes to Settings, and
deliberately picks their currency. The Getting Started checklist in About still
shows "Choose your currency" as incomplete, with no way to complete it other
than reopening the wizard.

Files: [PreferencesSection.tsx:202](components/settings/sections/PreferencesSection.tsx:202),
[SetupProgressProvider.tsx:130](providers/SetupProgressProvider.tsx:130)

---

### P2-5 — `enableInvestments` is gated inconsistently against the system flag

**What.** There are two flags: `settings.enableInvestments` (user) and
`system.enableInvestments` (admin). Only the screen itself checks both:

- [investments.tsx:25](app/(app)/investments.tsx:25) — `settings.enableInvestments && system.enableInvestments`
- [BottomNav.tsx:217](components/BottomNav.tsx:217) — user flag only
- [SideDrawer.tsx:132](components/SideDrawer.tsx:132) — user flag only
- [dashboard.tsx:296](app/(app)/dashboard.tsx:296) — user flag only

**Failure scenario.** Admin disables investments system-wide. Users who have the
feature on still see the Investments tab in the bottom nav and the drawer, and
the investments widget on the dashboard; tapping the tab lands on a
feature-disabled screen.

---

### P2-6 — `themeMode` is not persisted locally when set via a preset

**What.** `AppThemeProvider` has two writers and they persist different things:

- `setThemeMode` → `AsyncStorage[THEME_MODE_STORAGE_KEY]` + `AsyncStorage[THEME_STORAGE_KEY]` + Firestore
- `setThemeName` → `AsyncStorage[THEME_STORAGE_KEY]` + Firestore **only** — it
  calls `setThemeModeState(…)` but never writes `THEME_MODE_STORAGE_KEY`

**Why it matters.** The boot sequence reads `THEME_MODE_STORAGE_KEY` from
AsyncStorage before the user doc listener resolves, so the local value is what
the app renders during the first frames and the only value available offline or
pre-auth.

**Failure scenario.** User with mode `system` opens Theme Mode → Custom Presets →
Dark. `themeMode` becomes `"custom"` in memory and in Firestore, but AsyncStorage
still holds `"system"`. Relaunch in airplane mode: the app boots into
`"system"` mode and re-derives the theme from the OS scheme, discarding the
choice until Firestore reconnects.

Files: [ThemeProvider.tsx:136](theme/ThemeProvider.tsx:136)

---

### P2-7 — `users/{uid}` has two independent writers

**What.** `SettingsProvider` deliberately serialises its writes through a pending
queue with an optimistic overlay (`overlayRef`/`pendingRef`/`drainPendingWrites`)
— the comment at [SettingsProvider.tsx:112](providers/SettingsProvider.tsx:112)
records that a previous seeding race "wiped budget/accent/theme".
`AppThemeProvider` writes `theme` / `themeMode` / `accentColor` to the same
document with its own bare `setDoc(..., { merge: true })`, outside that queue,
and its failure path is `console.error` rather than `logError`/`toast` (the
required path per the error-handling audit).

`accentColor` and `themeMode` are also declared on `UserSettings` and seeded in
`SETTINGS_DEFAULTS`, and `SettingsProvider` exposes a `setAccentColor` — but the
Appearance UI uses the `useTheme()` setter, so the two setters for the same
field take different code paths.

**Why it matters.** Not a confirmed live bug — the writes are field-disjoint and
`merge: true` — but it is exactly the shape of the race the queue was introduced
to prevent, and a theme write failure is invisible to the user.

---

## P3 / hygiene

- **`compactListMode` is entirely dead.** Declared in `UserSettings`, defaulted,
  and given a `setCompactListMode` setter — no UI control and no consumer. Nothing
  in the app renders a compact list variant.
  ([settings.ts:50](shared/types/settings.ts:50))

- **`exportYear` is entirely dead.** Declared, defaulted to the current year,
  coerced in `mergeSettingsFromDoc`, given a setter — no UI, no consumer. The
  export flow (`components/analytics/ExportDataModal.tsx`) does not read it.
  ([settings.ts:53](shared/types/settings.ts:53))

- **`dashboardOrder` cannot be changed.** The dashboard genuinely consumes it via
  `getOrderedDashboardWidgets` ([dashboard.tsx:294](app/(app)/dashboard.tsx:294)),
  and `setDashboardOrder` exists, but there is no reorder UI anywhere — the
  Appearance section only offers on/off toggles for four widgets. Every user is on
  the default order permanently.

- **Quiet hours are honoured but not editable.** `quietHoursStart`/`quietHoursEnd`
  are read by the scheduler ([billReminderScheduler.ts:183](services/creditCardBills/billReminderScheduler.ts:183))
  and *displayed* to the user as `Quiet hours: 08:00–21:00`, with no control to
  change them. Presenting a stored value as prose invites the reading that it is
  configurable somewhere.

- **Bill reminder fire time ignores `settings.timezone`.**
  `dateTriggerFromDateKey` accepts a `timezone` argument and discards it with
  `void timezone;` ([billReminderScheduler.ts:110](services/creditCardBills/billReminderScheduler.ts:110)),
  scheduling on the device calendar instead. The comment above it is honest about
  this, but the Settings copy says "Local reminders use your timezone
  ({settings.timezone})", which is only true for *which day* is picked, not for
  *what time* it fires. Same root question as the Phase 5 carried-forward P2 about
  billing cycles vs. device clock.

- **Ghost mode has no control in Settings → Privacy.** `ghostMode` is fully
  implemented and consumed in five components, but its only toggles are in
  `SideDrawer` and `app/(nutrition)/profile.tsx`. The Privacy & security section —
  whose subtitle is "PIN, lock, duress & biometrics" and whose keywords include
  "privacy" — does not mention it.

- **`mergeSettingsFromDoc` spreads the whole user document into settings.**
  `source` is `{...data.settings, ...data}` and is then spread wholesale into the
  returned `UserSettings` ([settings.ts:236](shared/types/settings.ts:236)). Every
  unrelated `users/{uid}` field (`email`, `displayName`, `photoURL`, `theme`, …)
  ends up on the settings object, typed as `UserSettings` but carrying extra keys.
  Harmless today; it means `UserSettings` does not describe its own runtime shape.

- **9 unreachable `ThemeName` values remain in `theme/tokens.ts`.** Already logged
  as a Phase 6 carried-forward P3 and re-verified as still true: `THEME_LABELS`
  names 11 themes, the Custom Presets picker offers 2.

---

## Recommended fix order

1. **P1-6** (`daysBefore: []`) — the only true persistence bug; one-line change in
   the merge, plus a regression test.
2. **P1-5** (haptics bypass) — highest perceived-brokenness per unit of effort, but
   184 call sites; do it as a mechanical sweep to `lib/haptics.ts` with the three
   Settings components first.
3. **P1-4** (`defaultView: "add"`) — one branch in a four-line file.
4. **P2-1 / P2-2 / P2-3** (currency + number-format sourcing) — settle on
   `settings.currency` with `system.defaultCurrency` as the seed for a new user,
   then thread `numberFormatStyle` through the remaining `formatAmount` callers.
5. **P2-6** (`themeMode` local persistence) — one missing `AsyncStorage.setItem`.
6. **P2-4** (`currencyChosen`), **P2-5** (`enableInvestments` gating) — small,
   independent.
7. **P1-1 / P1-2 / P1-3** (`firstDayOfWeek`, `dateFormat`, `language`) — each needs
   a real implementation, not a fix. Decide per preference whether to build it or
   remove the control; shipping a picker that does nothing is worse than not
   offering it. `language` in particular is an app-wide i18n project, not a bug.
8. **P2-7** (two writers to `users/{uid}`) — route the theme writes through
   `SettingsProvider.updateSettings` so the queue and error handling apply.
9. **P3s** — delete `compactListMode` and `exportYear`, or implement them; add a
   reorder UI for `dashboardOrder` or drop the field from the picker's promise;
   surface quiet hours and ghost mode in Settings.

## Not found (checked, working as intended)

- `timezone` — genuinely threaded through 20+ consumers via
  `shared/utils/dates.ts` (`todayDateKey`/`currentMonthKey`/`nowTimeHm`).
- `upiId` — consumed by payment requests, splits, and QR generation, with an
  explicit "⚠ Not set — add in Settings" affordance.
- `lockPastMonths`, `privacyPin`, `fakePin`, `lockOnInactivity`,
  `inactivityTimeout`, `lockOnAppSwitch` — all read by `ExpenseForm` /
  `PrivacyLock`. PINs are hashed before storage.
- `dashboardWidgets` — toggles work and `getOrderedDashboardWidgets` honours them.
- `monthlyBudget` — debounced write, focus-loss flush, string coercion on read.
- `navigationStyle` — switches `MobileActionDock` vs `BottomNav`.
- `ghostMode`, `defaultCategory`, `accentColor` — consumed correctly.
- SMS automation prefs (`services/sms/smsAutomationPrefs.ts`) — deliberately
  device-local AsyncStorage, documented as such; they will not follow a user to a
  second device, which appears to be the intent for an Android-permission-scoped
  feature.
- The optimistic-overlay mechanism in `SettingsProvider`
  (`overlayPendingSettings`/`remainingPendingSettings`) correctly prevents a stale
  listener snapshot from reverting an in-flight write.

---

# Fix pass — 2026-08-22 (same day)

The audit above was diagnostic. This section records the follow-up pass that
applied fixes, on the brief "fix whatever setting was not working". Two scope
decisions were taken by the user rather than assumed:

- **`language`** — wire the 51 already-translated keys plus real RTL, rather than
  authoring 300-500 new keys across 7 languages. Machine-translating finance
  terminology into ja/ar/hi without a native reviewer was judged a quality risk,
  not a cost one.
- **`compactListMode` / `exportYear`** — implement both rather than delete.

## Correction to the audit above

**P2-1 understated the currency problem.** The audit said currency was "partially
working — the dashboard obeys it". It does not. `Amount` falls back to
`settings.currency` only when no `currency` prop is passed, and **153 call sites
across 42 files passed `system.defaultCurrency` explicitly**, so the fallback
almost never fired. "Preferred Currency" was very nearly non-functional
app-wide, not partially wired. The count in P2-1 (three consumers) described only
the `formatAmount` callers, missing every `Amount` `currency` prop.

## What changed

### Persistence

- **P1-6 `daysBefore: []`** — `mergeSettingsFromDoc` now distinguishes an absent
  key from a deliberately empty array, so "no pre-due reminders" saves. Verified
  as a real bug: the new regression test fails against the old `.length > 0`
  guard and passes with the fix.
- **P2-3 / merge hygiene** — `mergeSettingsFromDoc` takes an optional
  `fallbackCurrency` (fed from `system_settings/global.defaultCurrency` by
  `SettingsProvider`) so a new user is seeded from the system default instead of
  a hardcoded INR. The whole-document spread was replaced with an explicit
  `USER_SETTINGS_KEYS` allowlist, so profile fields no longer ride along on the
  settings object.

### Preferences that saved but were never read

- **`firstDayOfWeek`** — new `startOfWeekDateKey` / `endOfWeekDateKey` /
  `daysBetweenDateKeys` / `orderedWeekdays` helpers in `shared/utils/dates.ts`.
  `buildSmartInsights` now computes "this week" as the user's calendar week
  (previously a rolling 7 days, which gave the preference nothing to act on) and
  compares against **the same elapsed span** of the prior week rather than a full
  one. `getDayOfWeekDistribution` orders its bars by the preference.
- **`dateFormat`** — new `shared/utils/dateDisplay.ts` (`formatDisplayDate`,
  `formatDayHeading`, `formatMonthLabel`). Wired into `ExpenseList` day headings,
  the dashboard month chip, and the Monthly Analytics title, replacing hardcoded
  `en-US` locale calls.
- **`language`** — nav config gained a `translationKey` per item; `BottomNav` and
  `SideDrawer` render labels through `t()`. Added the two missing keys
  (`nav_investments`, `nav_admin`) across all 7 languages, taking each to 53.
  **RTL now actually applies**: `LocalizationProvider` calls
  `I18nManager.allowRTL` / `forceRTL` and tells the user a restart is needed —
  previously `isRTL` was computed, exposed, and ignored, so Arabic rendered LTR.
- **`defaultView: "add"`** — `app/(app)/index.tsx` now redirects to `/add`.
- **`hapticFeedback`** — swept **184 call sites across 80 files** from raw
  `expo-haptics` onto the gated `lib/haptics.ts` helper, which respects the
  toggle. Added `light()` / `medium()` / `warning()` so no caller needs to import
  `expo-haptics` just to name a style. `expo-haptics` is now imported by
  `lib/haptics.ts` alone. Two pre-existing unused imports were removed. One name
  collision (`Button`'s own boolean `haptic` prop) was caught by `tsc` and
  aliased.

### Inconsistent consumption

- **Currency (the big one)** — new `hooks/useDisplayCurrency.ts` returns
  `settings.currency` falling back to the system default. Swept all 153
  `system.defaultCurrency` display sites in 42 files onto it. Deliberately left
  reading the system value: the onboarding wizard's initial suggestion and the
  Preferences panel's "System currency" context subtitle. Per-record currencies
  (splits, public share snapshots) were left alone — those belong to the record,
  not the viewer.
- **`numberFormat`** — threaded into `MoneySection`'s budget labels and
  `buildSmartInsights`. Split/public-share formatting was left as-is (anonymous
  viewers have no preference to read).
- **SMS notification copy** — new `shared/utils/displayCurrency.ts`, a
  module-level mirror kept in sync by `SettingsProvider` and reset on sign-out,
  following the existing `haptic.setEnabled` pattern. Replaces the hardcoded
  INR literal without threading `settings` through six layers of SMS service
  calls.
- **`onboarding.currencyChosen`** — `setCurrency` now records the deliberate
  choice, so the Getting Started checklist step completes from Settings and not
  only from the wizard.
- **`enableInvestments`** — new `hooks/useInvestmentsEnabled.ts` requires both
  the user preference and the admin flag; adopted by `BottomNav`, `SideDrawer`,
  and the dashboard widget list, which previously checked only the user's.

### Theme

- **P2-6** — `setThemeName` now writes `THEME_MODE_STORAGE_KEY` to AsyncStorage
  as well as Firestore, so a Custom Preset choice survives an offline cold start.
- **P2-7 (partial)** — theme writes go through a new serialised
  `persistThemeFields` helper using `commitWrite` + `logError`, replacing three
  bare `setDoc` calls whose only failure path was a console error. **Not fully
  resolved**: `AppThemeProvider` is mounted *above* `SettingsProvider` in
  `app/_layout.tsx`, so it cannot reach that provider's write queue. Unifying
  them needs a provider-order change and was left out of this pass.

### Missing UI for implemented behaviour

- **`dashboardOrder`** — new `DashboardWidgetOrder` component (up/down reorder
  with accessibility labels), surfaced in Settings > Appearance. Previously the
  dashboard consumed the order and a setter existed, but nothing could change it.
- **Quiet hours** — now editable (start 06:00-10:00, end 18:00-23:00) instead of
  displayed as prose. The copy no longer implies the timezone governs the hour
  when it only governed the day.
- **Ghost mode** — added to Settings > Privacy & security, where users look for
  it; the side-drawer toggle remains.
- **`compactListMode`** — implemented: tighter row padding, smaller category
  avatar, and the category/account sub-line hidden, with a toggle plus
  explanatory copy in Settings > Preferences.
- **`exportYear`** — implemented: the export modal's year scope was hardcoded to
  the current year and now honours the saved preference, offering a year picker
  built from the years the user's data actually spans.

### Scheduler

- **Reminder fire time** — `dateTriggerFromDateKey` no longer discards its
  `timezone` argument. It converts the quiet-hours wall clock through the user's
  timezone via an `Intl`-derived offset, falling back to device-local time for an
  unrecognised zone id. Exported for direct unit testing.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **113 files, 1039 tests, all passing** (up from 1030).
- New tests: 16 in `shared/utils/dateDisplay.test.ts` (date formats, day
  headings, month labels, week boundaries across month/year edges), 10 added to
  `shared/types/settings.test.ts` (daysBefore persistence, currency seeding,
  allowlist), 5 added to `shared/utils/smartInsights.test.ts` (Monday vs Sunday
  weeks, equal-span comparison, numberFormat), 4 added to
  `services/creditCardBills/billReminderScheduler.test.ts` (timezone shift,
  unknown-zone fallback).
- The `daysBefore` fix was confirmed against the old logic: the regression test
  fails without it and passes with it.

## Still open after this pass

- **Deep-screen translation coverage.** Nav chrome and the Settings screens
  translate; the ~40 other screens remain hardcoded English by the scope decision
  above. The picker still offers 7 languages, so a user selecting Japanese sees a
  translated bottom nav and an English dashboard. Honest next step is either the
  full key sweep or trimming the picker.
- **RTL is layout-direction only.** `I18nManager.forceRTL` requires an app
  restart to take full effect, and no screen has been visually audited in a
  mirrored layout. Arabic may show cosmetic issues (icon direction, text
  alignment) that only a device pass will surface.
- **P2-7 not fully closed** — see Theme above; two writers still touch
  `users/{uid}`, now both with proper error handling but not a shared queue.
- **No device verification.** Everything here was verified by typecheck and unit
  tests. The haptics sweep in particular (184 sites) changes behaviour on real
  hardware only — worth a pass on an Android build before release.
- **9 unreachable `ThemeName` values** remain (Phase 6 carried-forward P3),
  untouched by this pass.
