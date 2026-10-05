/**
 * What-If baseline adapter (SPENDLY-387).
 *
 * Builds the runtime-only `WhatIfBaselineSnapshot` from the same pieces the
 * Financial Runway uses: counted liquid money, the projection baseline and
 * the scheduled commitments (subscriptions, EMIs, open card bills). It always
 * uses the commitment-projection view, whatever mode the runway screen is in,
 * because What-If changes are applied to scheduled events.
 *
 * Nothing here is persisted. `sourceVersions` are cheap fingerprints of the
 * inputs so a saved scenario can tell the user "your data changed since you
 * saved this" (`whatIfRecalculationStatus`).
 */

import type { CalendarEvent } from "../types/calendar";
import type { Expense, Income } from "../types/expense";
import type { WhatIfBaselineReference, WhatIfBaselineSnapshot } from "../types/whatIf";
import { roundMoney } from "./money";
import type { RunwayBaselineResult } from "./runwayBaseline";
import { calendarToRunwayEvents } from "./runwayEvents";

export interface WhatIfBaselineInput {
  today: string;
  currency: string;
  timezone: string;
  /** Counted liquid money (runway sources); null when unknown. */
  liquid: number | null;
  runwayBaseline: RunwayBaselineResult;
  calendarEvents: readonly CalendarEvent[];
  expenses: readonly Pick<Expense, "amount">[];
  incomes: readonly Pick<Income, "amount">[];
}

function fingerprint(rows: readonly { amount?: number | null }[]): string {
  const sum = rows.reduce((total, row) => total + (Number.isFinite(row.amount) ? (row.amount as number) : 0), 0);
  return `${rows.length}:${roundMoney(sum)}`;
}

/** Today's reference, with a fingerprint per input source. */
export function buildWhatIfReference(input: WhatIfBaselineInput): WhatIfBaselineReference {
  return {
    asOfDate: input.today,
    currency: input.currency,
    timezone: input.timezone || "UTC",
    sourceVersions: [
      { source: "accounts", version: input.liquid === null ? "unknown" : String(roundMoney(input.liquid)) },
      { source: "expenses", version: fingerprint(input.expenses) },
      { source: "incomes", version: fingerprint(input.incomes) },
      { source: "calendar", version: fingerprint(input.calendarEvents) },
    ],
  };
}

export function buildWhatIfBaselineSnapshot(input: WhatIfBaselineInput): WhatIfBaselineSnapshot {
  return {
    reference: buildWhatIfReference(input),
    liquid: input.liquid === null ? null : roundMoney(input.liquid),
    baseline: input.runwayBaseline.projectionBaseline,
    events: calendarToRunwayEvents(input.calendarEvents, input.today, input.currency),
  };
}
