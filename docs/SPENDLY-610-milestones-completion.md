# SPENDLY-610: Milestones, goal completion and achievement timeline

Part of SPENDLY-606. Tracker: `docs/SPENDLY-606-save-goals.md`. Design: `docs/features/save-goals/IMPLEMENTATION_PLAN.md` §2.6.

Milestone crossing events have been written since 607/609. Every amount, target or milestone change records `milestone_reached` / `milestone_lost` with deterministic ids. This story adds what the user sees and does with them.

## What changed

### Milestones (FRD FR-07)
- **`components/goals/GoalMilestonesSection.tsx`:** on the goal page, each milestone shows as reached or not. This is derived from the saved amount, so it follows reductions. The section also shows how far the next one is.
- **`components/goals/GoalMilestonesSheet.tsx`:**
  - Edit amounts and labels, add up to 10, remove any, or "Use defaults" (25/50/75/100% of the current target).
  - Rows keep their ids, so relabelling a milestone keeps its history. Stretch milestones above the target are allowed.
- **Saving:** `useFinancialGoals.changeMilestones` writes via `buildMilestonesChange`, which records crossings caused by the new configuration.
- **History filter:** an "Achievements" chip shows `milestone_reached` + `completed` events. It needs the new `goalEvents (goalId, type, createdAtMs desc)` index.

### Celebrations without duplicates
- `shared/utils/goalAchievements.celebrationFor` picks **one** celebration per committed write: completion beats any milestone, and among milestones the highest wins. A loss is never celebrated.
- **`hooks/useGoalCelebrations.ts`** keeps a session-wide `CelebrationGuard`, keyed by event id.
  - Celebrations fire **only after this device's write is saved or durably queued**, through the new `onSaved` callback on the hook actions; never for a refused write.
  - A retry of the same submit carries the same derived ids, so it can't celebrate twice.
  - Another device's achievements appear in the history, not as confetti.
- **Re-achievement:** a drop below a milestone records `milestone_lost`. Rising past it again records a new `milestone_reached` (a new cause id), which is celebrated again. That is intended (FRD FR-07).

### Target reached → ask to complete (FRD FR-05)
- When a contribution or correction takes an open goal to its target (`targetJustReached`), a dialog asks "Mark it completed?". That prompt replaces the 100% milestone celebration.
- Completing celebrates. "Keep saving" leaves the goal open, and the page banner keeps the option available.

### Completion (FRD FR-08)
- **`components/goals/GoalCompletionSection.tsx`** shows the final amount against the target, any surplus, days taken and milestones reached.
  - It is built from the summary document only, with no history read.
  - The achievement history is one tap away (the Achievements filter).
- Completed goals still reject contributions in the builder and the rules (608).
- Reopening keeps the original `completed` event. Completing again adds a new one.

### Reduced motion (FRD FR-08/FR-15)
- `CelebrationEvent.respectReducedMotion` is new and opt-in, so celebrations elsewhere in the app are unchanged.
- With reduced motion on, `CelebrationOverlay` shows a still card: no confetti, springs, pulse or entering animations. It also announces the title and subtitle to screen readers.
- Every goal celebration sets the flag. The card is also marked `accessibilityViewIsModal` with a polite live region.

## Acceptance criteria → evidence
| AC | Evidence |
|---|---|
| Milestone transitions are deterministic for contribution, reduction and target changes | `goalMilestones.test.ts` (crossings, target moves defaults, removal ≠ loss); `goalWrites.test.ts`; new rules tests ("custom milestones … records achievements once", drop below keeps the earlier event) |
| Duplicate processing never duplicates celebrations or achievements | Deterministic ids `${cause}__ms_${id}` + create-only events (a rules test refuses replays); `CelebrationGuard` test, including a retry carrying the same id |
| Target changes preserve historical progress and milestone events | `target_changed` event with before/after values. A target change records crossings for default milestones, and earlier events are untouched |
| Respects reduced motion and accessibility | Opt-in still card + `announceForAccessibility`; milestone rows have full a11y labels. **Device check pending** (user review) |

## Tests run
- `goalAchievements.test.ts`: 12 tests. Covers which celebration wins, the guard, re-achievement, `targetJustReached`, milestone status, the completion summary and the editor parser.
- `firestore/saveGoals.rules.test.ts`: 33 passed. New in this story: custom milestones + achievement events, a milestone event carrying money refused, and the owner-only achievements query.
- Full `npx vitest run`, `npm run test:rules`, `tsc` and `typecheck:shared`: see the Jira comment for this commit.

## Production steps
- New index `goalEvents (goalId, type ASC, createdAtMs DESC)`. Diff against live, then deploy with the 609 index.

## Known limitations
- A celebration shows only on the device that made the change. Cross-device milestone notifications need remote push (SPENDLY-222); local milestone notifications come in 612.
- When reduced motion is off, the overlay's look is unchanged from the existing app celebration.
