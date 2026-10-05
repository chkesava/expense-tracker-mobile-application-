# SPENDLY-212: QA and Rollout for Financial Runway

## Overview

This document outlines the Manual Testing Guide and Rollout steps for completing the Financial Runway epic (SPENDLY-204), validating Runway correctness, What-If integration, privacy, and overall performance.

## Manual Testing Guide

1. **Prerequisites & Setup:**
   - Ensure you have the latest code from `main`.
   - Start the local emulators: `npm run emulators:local` and `npm run emulators:seed`.
   - Run the app via Expo: `npx expo start --web` (or test on Android using an emulator or physical device).
   - Log in using a test account (e.g., `demo@spendly.test / spendly-demo`).

2. **Runway Core Calculations:**
   - **Zero Balance/Zero Burn:** Check the Financial Runway screen. If there is no balance or burn, it should show a placeholder or "insufficient data" state.
   - **Positive/Negative Flow:** Verify the projected month-by-month changes dynamically based on expenses exceeding income (or vice versa).
   - **Methodology Visibility:** Tap "How this is worked out" to verify the calculation rules are clear and accurate.

3. **Financial Calendar Integration (SPENDLY-209):**
   - Create recurring events (Subscriptions, EMIs) in the Spendly ledger.
   - Verify they correctly appear as "Scheduled commitments" with the right amount and recurrence on the Runway Timeline and Drivers breakdown.

4. **What-If Integration (SPENDLY-211):**
   - Tap "Try a What If" from the Runway UI.
   - Make hypothetical adjustments (e.g., "Add new EMI").
   - Verify the "Scenario" line updates dynamically, leaving the "Current path" intact.
   - Confirm that actual account balances or Firestore ledger records are **not** mutated.

5. **Performance (Android Focus):**
   - Navigate back and forth between Ledger, Calendar, and Runway screens to ensure there are no noticeable lag or memory leaks on low/mid-tier devices.
   - Open a long-standing test account with many records to ensure projection calculation doesn't block the main thread for long durations.

## Rollout / After-Merge Checklist

Once this branch is merged into `main`, the rollout follows standard procedures.

No database migrations or irreversible data mutators are included in this release.

Paste the following into the Jira ticket upon merge to `main`:

```text
Leftovers (see docs/AFTER_MERGE_CHECKLIST.md):

- [ ] GitHub → Actions → Deploy Web (Netlify) → Run workflow on main
- [ ] GitHub → Actions → Release — Expense → Run workflow on main
```
