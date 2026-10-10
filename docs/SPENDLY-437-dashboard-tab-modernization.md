# SPENDLY-437 — Dashboard & Tab Visual Modernization (epic)

| Field | Value |
| --- | --- |
| Jira | [SPENDLY-437](https://kesavach.atlassian.net/browse/SPENDLY-437) |
| Type | Epic |
| Branch | `feature/SPENDLY-437-dashboard-tab-modernization` |
| Status | In Progress |

Phased premium fintech visual refresh of Spendly's main tabs, one tab at a time. Dashboard is phase 1. Presentation-layer only — reuses existing hooks/data contracts and the already-shipped `KAN-62` dashboard information architecture (`docs/KAN-62-spendly-dashboard-control-center.md`). Every "hero" surface is built from the active theme's own tokens (`theme.colors.primary`/`primaryForeground`, mixed via `mixColors`), never a hardcoded brand hex, so it holds up across all 11 app themes (`theme/tokens.ts`).

## Stories

One story per screen/sub-screen, not per tab — a hub screen with multiple tabs (Money, Vaults, Investments) gets one story per tab, matching how distinct each one actually reads to a user.

| Story | Scope | File(s) | State |
| --- | --- | --- | --- |
| [SPENDLY-438](https://kesavach.atlassian.net/browse/SPENDLY-438) | Dashboard visual modernization | `app/(app)/dashboard.tsx`, `components/dashboard/*` | **Done** — merged to `main` at `63af9bb`, see `docs/SPENDLY-438-dashboard-visual-refresh.md` |

### Money tab

| Story | Scope | File(s) |
| --- | --- | --- |
| [SPENDLY-439](https://kesavach.atlassian.net/browse/SPENDLY-439) | Journal | `app/(app)/ledger.tsx` (`expenses` tab) |
| [SPENDLY-440](https://kesavach.atlassian.net/browse/SPENDLY-440) | Accounts list | `app/(app)/ledger.tsx` (`accounts` tab) |
| [SPENDLY-441](https://kesavach.atlassian.net/browse/SPENDLY-441) | Account detail | `app/(app)/accounts/[id].tsx` |
| [SPENDLY-442](https://kesavach.atlassian.net/browse/SPENDLY-442) | Cards | `app/(app)/ledger.tsx` (`cards` tab) |
| [SPENDLY-443](https://kesavach.atlassian.net/browse/SPENDLY-443) | Credit card bill detail | `app/(app)/credit-card-bills/[id].tsx` |
| [SPENDLY-444](https://kesavach.atlassian.net/browse/SPENDLY-444) | CC bill discrepancies | `app/(app)/credit-card-bills/discrepancies.tsx` |
| [SPENDLY-445](https://kesavach.atlassian.net/browse/SPENDLY-445) | Borrowings | `app/(app)/ledger.tsx` (`borrowings` tab) |
| [SPENDLY-446](https://kesavach.atlassian.net/browse/SPENDLY-446) | Receivables | `app/(app)/ledger.tsx` (`receivables` tab) |
| [SPENDLY-447](https://kesavach.atlassian.net/browse/SPENDLY-447) | Subscriptions / Recurring | `app/(app)/ledger.tsx` (`subscriptions` tab) |
| [SPENDLY-448](https://kesavach.atlassian.net/browse/SPENDLY-448) | Transaction detail | `app/(app)/transactions/[id].tsx` |
| [SPENDLY-449](https://kesavach.atlassian.net/browse/SPENDLY-449) | SMS inbox | `app/(app)/sms-inbox.tsx` |

### Vaults tab

| Story | Scope | File(s) |
| --- | --- | --- |
| [SPENDLY-450](https://kesavach.atlassian.net/browse/SPENDLY-450) | Shared space | `app/(app)/vaults.tsx` (`shared` tab) |
| [SPENDLY-451](https://kesavach.atlassian.net/browse/SPENDLY-451) | Spaces | `app/(app)/vaults.tsx` (`spaces` tab) |
| [SPENDLY-452](https://kesavach.atlassian.net/browse/SPENDLY-452) | Splits | `app/(app)/vaults.tsx` (`splits` tab), `components/splits/*` |
| [SPENDLY-453](https://kesavach.atlassian.net/browse/SPENDLY-453) | Travel | `app/(app)/vaults.tsx` (`travel` tab), `components/trips/*` |
| [SPENDLY-454](https://kesavach.atlassian.net/browse/SPENDLY-454) | Collect | `app/(app)/vaults.tsx` (`collect` tab) |

### Investments tab

| Story | Scope | File(s) |
| --- | --- | --- |
| [SPENDLY-455](https://kesavach.atlassian.net/browse/SPENDLY-455) | Investments overview | `app/(app)/investments.tsx` (`investments` tab) |
| [SPENDLY-456](https://kesavach.atlassian.net/browse/SPENDLY-456) | Portfolio | `app/(app)/investments.tsx` (`portfolio` tab), `components/portfolio/*` |
| [SPENDLY-457](https://kesavach.atlassian.net/browse/SPENDLY-457) | SIP | `app/(app)/investments.tsx` (`sip` tab) |
| [SPENDLY-458](https://kesavach.atlassian.net/browse/SPENDLY-458) | EPF | `app/(app)/investments.tsx` (`epf` tab), `components/epf/*` |
| [SPENDLY-459](https://kesavach.atlassian.net/browse/SPENDLY-459) | EPF establishment detail | `app/(app)/epf/[establishmentId].tsx` |

### Insights & analysis

| Story | Scope | File(s) |
| --- | --- | --- |
| [SPENDLY-460](https://kesavach.atlassian.net/browse/SPENDLY-460) | Insights | `app/(app)/insights.tsx` |
| [SPENDLY-461](https://kesavach.atlassian.net/browse/SPENDLY-461) | Merchants list | `app/(app)/merchants/index.tsx` |
| [SPENDLY-462](https://kesavach.atlassian.net/browse/SPENDLY-462) | Merchant detail | `app/(app)/merchants/[id].tsx` |
| [SPENDLY-463](https://kesavach.atlassian.net/browse/SPENDLY-463) | Fees list | `app/(app)/fees/index.tsx` |
| [SPENDLY-464](https://kesavach.atlassian.net/browse/SPENDLY-464) | Fee detail | `app/(app)/fees/[key].tsx` |
| [SPENDLY-465](https://kesavach.atlassian.net/browse/SPENDLY-465) | Decisions list | `app/(app)/decisions/index.tsx` |
| [SPENDLY-466](https://kesavach.atlassian.net/browse/SPENDLY-466) | Decision detail | `app/(app)/decisions/[id].tsx` |
| [SPENDLY-467](https://kesavach.atlassian.net/browse/SPENDLY-467) | Decisions compare | `app/(app)/decisions/compare.tsx` |
| [SPENDLY-468](https://kesavach.atlassian.net/browse/SPENDLY-468) | Decision edit | `app/(app)/decisions/edit.tsx` |
| [SPENDLY-469](https://kesavach.atlassian.net/browse/SPENDLY-469) | Decisions insights | `app/(app)/decisions/insights.tsx` |

### Calendar, What-If, Runway, Goals

| Story | Scope | File(s) |
| --- | --- | --- |
| [SPENDLY-470](https://kesavach.atlassian.net/browse/SPENDLY-470) | Financial calendar | `app/(app)/calendar/index.tsx` |
| [SPENDLY-471](https://kesavach.atlassian.net/browse/SPENDLY-471) | What-If list | `app/(app)/what-if/index.tsx` |
| [SPENDLY-472](https://kesavach.atlassian.net/browse/SPENDLY-472) | What-If detail | `app/(app)/what-if/[id].tsx` |
| [SPENDLY-473](https://kesavach.atlassian.net/browse/SPENDLY-473) | What-If edit | `app/(app)/what-if/edit.tsx` |
| [SPENDLY-474](https://kesavach.atlassian.net/browse/SPENDLY-474) | Runway overview | `app/(app)/runway/index.tsx` |
| [SPENDLY-475](https://kesavach.atlassian.net/browse/SPENDLY-475) | Runway sources | `app/(app)/runway/sources.tsx` |
| [SPENDLY-476](https://kesavach.atlassian.net/browse/SPENDLY-476) | Goals optimizer | `app/(app)/goals/optimizer.tsx` |

### Settings

| Story | Scope | File(s) |
| --- | --- | --- |
| [SPENDLY-477](https://kesavach.atlassian.net/browse/SPENDLY-477) | Settings hub | `app/(app)/settings/index.tsx` |
| [SPENDLY-478](https://kesavach.atlassian.net/browse/SPENDLY-478) | Profile | `app/(app)/settings/[section].tsx` (`profile`) |
| [SPENDLY-479](https://kesavach.atlassian.net/browse/SPENDLY-479) | Appearance | `app/(app)/settings/[section].tsx` (`appearance`) |
| [SPENDLY-480](https://kesavach.atlassian.net/browse/SPENDLY-480) | Preferences | `app/(app)/settings/[section].tsx` (`preferences`) |
| [SPENDLY-481](https://kesavach.atlassian.net/browse/SPENDLY-481) | Money & categories | `app/(app)/settings/[section].tsx` (`money`) |
| [SPENDLY-482](https://kesavach.atlassian.net/browse/SPENDLY-482) | Accounts config | `app/(app)/settings/[section].tsx` (`accounts`) |
| [SPENDLY-483](https://kesavach.atlassian.net/browse/SPENDLY-483) | Automation | `app/(app)/settings/[section].tsx` (`automation`) |
| [SPENDLY-484](https://kesavach.atlassian.net/browse/SPENDLY-484) | Privacy & security | `app/(app)/settings/[section].tsx` (`privacy`) |
| [SPENDLY-485](https://kesavach.atlassian.net/browse/SPENDLY-485) | About | `app/(app)/settings/[section].tsx` (`about`) |

### Deliberately not a story here

- **App selector** (`app/(app)/app-selector.tsx`) — shared cross-product chrome (Expense/Nutrition/Ganesh switcher), not Spendly-only. Needs its own multi-app-safety review before any visual change, not a Spendly reskin story.
- **Ganesh Seva / Nutrition screens** — out of scope for this epic entirely; Ganesh UI work follows the separate Ganesh Seva rules in the repo's `CLAUDE.md`.

## Non-goals (repo-wide, this epic)

- No change to any widget's data contract, calculation, or Firestore reads.
- No bottom-nav rework — `components/BottomNav.tsx` already has the translucent capsule + FAB the reference brief asks for.
- No Ganesh Seva or Nutrition changes.
