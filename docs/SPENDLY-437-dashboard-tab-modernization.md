# SPENDLY-437 — Dashboard & Tab Visual Modernization (epic)

| Field | Value |
| --- | --- |
| Jira | [SPENDLY-437](https://kesavach.atlassian.net/browse/SPENDLY-437) |
| Type | Epic |
| Branch | `feature/SPENDLY-437-dashboard-tab-modernization` |
| Status | In Progress |

Phased premium fintech visual refresh of Spendly's main tabs, one tab at a time. Dashboard is phase 1. Presentation-layer only — reuses existing hooks/data contracts and the already-shipped `KAN-62` dashboard information architecture (`docs/KAN-62-spendly-dashboard-control-center.md`). Every "hero" surface is built from the active theme's own tokens (`theme.colors.primary`/`primaryForeground`, mixed via `mixColors`), never a hardcoded brand hex, so it holds up across all 11 app themes (`theme/tokens.ts`).

## Stories

| Story | Scope | State |
| --- | --- | --- |
| [SPENDLY-438](https://kesavach.atlassian.net/browse/SPENDLY-438) | Dashboard visual modernization | In Progress — see `docs/SPENDLY-438-dashboard-visual-refresh.md` |

## Non-goals (repo-wide, this epic)

- No change to any widget's data contract, calculation, or Firestore reads.
- No bottom-nav rework — `components/BottomNav.tsx` already has the translucent capsule + FAB the reference brief asks for.
- No Ganesh Seva or Nutrition changes.
