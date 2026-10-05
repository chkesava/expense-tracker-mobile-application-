# SPENDLY-396: Startup Performance & App Responsiveness

## Overview
Improve Spendly Android startup performance and first-use responsiveness using measured, evidence-based performance engineering.

## State
- **SPENDLY-397**: In Progress (Instrumentation completed, awaiting baseline metrics from device)
- **SPENDLY-398**: In Progress (Documentation added, awaiting test execution on device)
- **SPENDLY-399**: To Do
- **SPENDLY-400**: To Do
- **SPENDLY-401**: To Do
- **SPENDLY-402**: To Do
- **SPENDLY-403**: To Do
- **SPENDLY-404**: To Do
- **SPENDLY-405**: To Do

## Decisions
- Instrumented critical startup phases, Firestore listeners, and snapshot deliveries using the updated `lib/perf.ts` system.
- Formalized the 5-scenario benchmark suite in `docs/PERF_BASELINE.md`.
- Need real-device metrics (Phase 2 & 4) before deciding which specific area to optimize.
