import { useCallback } from "react";

import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useCelebration } from "@/providers/CelebrationProvider";
import { CelebrationGuard, celebrationFor } from "@/shared/utils/goalAchievements";
import { fillAmounts } from "@/shared/utils/goalHistory";
import type { GoalWritePlan } from "@/shared/utils/goalWrites";

/**
 * One guard for the whole session: an achievement is celebrated at most once
 * on this device, whatever re-renders, retries or screens it passes through.
 * Celebrations fire only for writes this device committed (FRD FR-07): other
 * devices' achievements appear in the history, not as a burst of confetti.
 */
const guard = new CelebrationGuard();

/** Test seam / explicit claim (e.g. a milestone folded into the "mark completed?" prompt). */
export function claimGoalCelebration(eventId: string): boolean {
  return guard.claim(eventId);
}

/**
 * SPENDLY-610 — celebrate a milestone or a completion after a committed write.
 * Uses the shared CelebrationOverlay with `respectReducedMotion`, so devices
 * that ask for reduced motion get a still card and a screen-reader
 * announcement instead of confetti.
 */
export function useGoalCelebrations(currency: string) {
  const { celebrate } = useCelebration();
  const money = useGhostMoney(currency);
  return useCallback(
    /**
     * `milestones: false` (the goal's "milestone alerts" reminder setting,
     * SPENDLY-612) skips milestone celebrations; completion always celebrates.
     */
    (goalName: string, plan: GoalWritePlan, options?: { milestones?: boolean }) => {
      const c = celebrationFor(goalName, plan.events);
      if (!c) return;
      if (c.kind === "milestone" && options?.milestones === false) return;
      if (!guard.claim(c.eventId)) return;
      celebrate({
        title: c.title,
        subtitle: fillAmounts(c.subtitle, c.amounts, money),
        badgeEmoji: c.badgeEmoji,
        respectReducedMotion: true,
      });
    },
    [celebrate, money]
  );
}
