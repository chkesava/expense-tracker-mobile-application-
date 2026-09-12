/**
 * Actual-vs-simulated balance reconciliation — KAN-70.
 *
 * Spendly's balance is derived from contributions, transfers and interest. A
 * real EPFO passbook will disagree with it — rounding, an employer's late
 * remittance, a rate Spendly does not have. This records what the user actually
 * saw and moves the balance to match **without touching a single contribution
 * row**, which the ticket forbids outright.
 *
 * Observations are append-only, so repeated reconciliations accumulate as a
 * history by construction rather than by a rule someone has to remember.
 */

import type {
  EpfReconciliation,
  EpfReconciliationIssue,
} from "@/shared/features/epf/types";
import { roundMoney } from "@/shared/utils/money";

/** Signed difference. Positive means EPFO holds more than Spendly computed. */
export function calculateVariance(actualBalance: number, calculatedBalance: number): number {
  return roundMoney(actualBalance - calculatedBalance);
}

export interface EpfReconciliationInput {
  establishmentId: string;
  date: string;
  actualBalance: number;
  calculatedBalance: number;
  reference?: string;
  notes?: string;
}

/** Validate an observation. Returns issues; never throws. */
export function validateReconciliation(
  input: EpfReconciliationInput,
  ctx: { knownEstablishmentIds: string[]; todayKey: string }
): EpfReconciliationIssue[] {
  const issues: EpfReconciliationIssue[] = [];
  const add = (
    code: EpfReconciliationIssue["code"],
    message: string,
    field?: string
  ) => issues.push({ code, message, field, severity: "error" });

  if (!input.establishmentId || !ctx.knownEstablishmentIds.includes(input.establishmentId)) {
    add("missing_establishment", "Pick an employer from your list.", "establishmentId");
  }

  if (!(input.actualBalance >= 0)) {
    add("negative_balance", "Balance cannot be negative.", "actualBalance");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    add("invalid_date", "Enter a valid date.", "date");
  } else if (input.date > ctx.todayKey) {
    add("future_date", "You cannot record a balance from the future.", "date");
  }

  return issues;
}

export function reconciliationHasErrors(issues: EpfReconciliationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/**
 * Build the observation to store.
 *
 * `adjustmentAmount` is the variance, which is what moves the balance. Keeping
 * both the actual and the calculated figure alongside it means the correction
 * stays explainable later, rather than becoming an unexplained delta.
 */
export function buildReconciliation(
  input: EpfReconciliationInput
): Omit<EpfReconciliation, "id" | "createdAt"> {
  return {
    establishmentId: input.establishmentId,
    date: input.date,
    actualBalance: roundMoney(input.actualBalance),
    calculatedBalance: roundMoney(input.calculatedBalance),
    adjustmentAmount: calculateVariance(input.actualBalance, input.calculatedBalance),
    reference: input.reference || undefined,
    notes: input.notes || undefined,
  };
}

/** Observations for one establishment, newest first. */
export function reconciliationHistory(
  reconciliations: EpfReconciliation[],
  establishmentId: string
): EpfReconciliation[] {
  return reconciliations
    .filter((row) => row.establishmentId === establishmentId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function latestReconciliation(
  reconciliations: EpfReconciliation[],
  establishmentId: string
): EpfReconciliation | null {
  return reconciliationHistory(reconciliations, establishmentId)[0] ?? null;
}

/** Total of every adjustment applied to one establishment. */
export function totalAdjustments(
  reconciliations: EpfReconciliation[],
  establishmentId: string
): number {
  return roundMoney(
    reconciliations.reduce(
      (total, row) =>
        row.establishmentId === establishmentId ? total + row.adjustmentAmount : total,
      0
    )
  );
}

/** Tolerant read. */
export function normalizeReconciliation(
  id: string,
  raw: Record<string, unknown>
): EpfReconciliation {
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const str = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;

  return {
    id,
    establishmentId: str(raw.establishmentId) ?? "",
    date: str(raw.date) ?? "",
    actualBalance: num(raw.actualBalance),
    calculatedBalance: num(raw.calculatedBalance),
    adjustmentAmount: num(raw.adjustmentAmount),
    reference: str(raw.reference),
    notes: str(raw.notes),
    createdAt: raw.createdAt,
  };
}
