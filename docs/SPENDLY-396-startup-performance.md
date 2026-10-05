# SPENDLY-396: Startup Performance & App Responsiveness

## Overview
Improve Spendly Android startup performance and first-use responsiveness using measured, evidence-based performance engineering.

## State
- **SPENDLY-397**: Merged into epic branch
- **SPENDLY-398**: Merged into epic branch
- **SPENDLY-399**: Merged into epic branch
- **SPENDLY-400**: To Do
- **SPENDLY-401**: To Do
- **SPENDLY-402**: To Do
- **SPENDLY-403**: To Do
- **SPENDLY-404**: To Do
- **SPENDLY-405**: To Do

## Decisions
- Instrumented critical startup phases, Firestore listeners, and snapshot deliveries using the updated `lib/perf.ts` system (SPENDLY-397).
- Formalized the 5-scenario benchmark suite in `docs/PERF_BASELINE.md` and captured Scenario 1 baseline metrics (SPENDLY-398).
- Fixed the double-mount root cause in `SettingsProvider.tsx` (removed `SettingsBootSplash` gate), removed the layout spinner gate in `app/(app)/_layout.tsx`, and pruned non-critical stores/nav checks from the splash critical path in `app/_layout.tsx`. Achieved ~90% reduction in `app_ready` time (from 1938ms down to 193ms) (SPENDLY-399).
