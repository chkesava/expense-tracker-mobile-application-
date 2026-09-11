/**
 * Client-side catch-up for EPF contributions — KAN-67.
 *
 * The Netlify cron is authoritative, but it runs monthly and pages through
 * users. This fills the gap so someone opening the app always sees the current
 * month, even if the cron has not reached their page yet or a page failed.
 *
 * It calls the *same* pure generator as the server
 * (`shared/features/epf/utils/schedule.ts`), so the two can never disagree
 * about which months are owed or what they contain.
 */

import { useEffect, useRef } from "react";

import { useEpfContributions } from "@/hooks/useEpfContributions";
import { logError } from "@/lib/errors";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import { isSchedulable, planScheduledContributions } from "@/shared/features/epf/utils/schedule";
import { currentMonthKey } from "@/shared/utils/dates";

export function useEpfCatchUp(args: {
  establishment: EpfEstablishment | null;
  allEstablishments: EpfEstablishment[];
  enabled?: boolean;
}) {
  const { establishment, allEstablishments, enabled = true } = args;
  const { contributions, contributionsLoading, saveContributions } = useEpfContributions(
    establishment?.id,
    { enabled: enabled && Boolean(establishment) }
  );

  // One attempt per establishment per mount. Without this the effect would
  // re-fire on every snapshot the write itself triggers.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !establishment || contributionsLoading) return;
    if (!isSchedulable(establishment)) return;
    if (attempted.current === establishment.id) return;
    attempted.current = establishment.id;

    const planned = planScheduledContributions({
      establishment,
      allEstablishments,
      existing: contributions,
      throughMonth: currentMonthKey(),
    });
    if (planned.length === 0) return;

    // Fire-and-forget: this is a background convenience, never something the
    // user is waiting on. saveContributions already toasts and logs.
    saveContributions(planned, { status: "expected" }).catch((err) => {
      logError("epf.catchup", err);
    });
  }, [
    enabled,
    establishment,
    allEstablishments,
    contributions,
    contributionsLoading,
    saveContributions,
  ]);
}
