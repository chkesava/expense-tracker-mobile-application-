/**
 * EPF transfers between establishments — KAN-69.
 *
 * When someone changes jobs their balance follows them. This is that movement:
 * traceable, reversible, and crucially it **never touches a monthly
 * contribution record** — the ticket's central requirement. Transfers are a
 * separate ledger layered on top of contribution history.
 *
 * Transfers are *simulated* moves inside Spendly. The app cannot file an EPFO
 * claim, so `reconciledAt` marks the ones a person has confirmed against a real
 * transfer — the same projected-versus-confirmed split KAN-68 uses for credits.
 *
 * Pure by necessity: `hooks/**` and `components/**` never run under `npm test`.
 */

import type {
  EpfContribution,
  EpfTransfer,
  EpfTransferDisplayState,
  EpfTransferIssue,
  EpfTransferSummary,
} from "@/shared/features/epf/types";
import { roundMoney } from "@/shared/utils/money";

/** Contribution statuses that have actually added money to the fund. */
const BALANCE_BEARING: EpfContribution["status"][] = ["credited", "partial", "confirmed"];

/**
 * What a single establishment holds.
 *
 * **The one definition of EPF balance.** KAN-70 (interest) and KAN-71
 * (dashboard) must consume this rather than re-deriving it, or three tickets
 * end up with three subtly different numbers.
 *
 *   balance = credited contributions
 *           + completed transfers in
 *           − completed transfers out
 *
 * Only `completed` transfers move balance. An `initiated` one has not settled
 * and a `failed` one never will. A reversed pair nets to zero on its own,
 * because the original keeps `completed` and the compensating row counts in the
 * opposite direction — no special-casing needed here.
 */
export function establishmentBalance(args: {
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  establishmentId: string;
}): number {
  const { contributions, transfers, establishmentId } = args;

  const contributed = contributions.reduce((total, row) => {
    if (row.establishmentId !== establishmentId) return total;
    if (!BALANCE_BEARING.includes(row.status)) return total;
    return total + (row.creditedAmount ?? row.epfCredit);
  }, 0);

  const moved = transfers.reduce((total, transfer) => {
    if (transfer.status !== "completed") return total;
    if (transfer.destinationEstablishmentId === establishmentId) return total + transfer.amount;
    if (transfer.sourceEstablishmentId === establishmentId) return total - transfer.amount;
    return total;
  }, 0);

  return roundMoney(contributed + moved);
}

/** What may actually be moved out. A negative balance is never transferable. */
export function transferableBalance(args: {
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  establishmentId: string;
}): number {
  return Math.max(0, establishmentBalance(args));
}

export interface EpfTransferInput {
  sourceEstablishmentId: string;
  destinationEstablishmentId: string;
  amount: number;
  date: string;
  adjustmentReason?: string;
}

/**
 * Validate a proposed transfer. Returns issues; never throws.
 *
 * Over-balance is allowed *with an explicit reason*, because real EPFO
 * statements disagree with a simulation often enough that a hard block would
 * strand users with no way to record what actually happened.
 */
export function validateTransfer(
  input: EpfTransferInput,
  ctx: { knownEstablishmentIds: string[]; availableBalance: number; todayKey: string }
): EpfTransferIssue[] {
  const issues: EpfTransferIssue[] = [];
  const add = (
    code: EpfTransferIssue["code"],
    message: string,
    field?: string,
    severity: EpfTransferIssue["severity"] = "error"
  ) => issues.push({ code, message, field, severity });

  if (
    input.sourceEstablishmentId &&
    input.sourceEstablishmentId === input.destinationEstablishmentId
  ) {
    add(
      "self_transfer",
      "Source and destination must be different employers.",
      "destinationEstablishmentId"
    );
  }

  // Both must exist under this user, which is what keeps a transfer inside one UAN.
  for (const [field, id] of [
    ["sourceEstablishmentId", input.sourceEstablishmentId],
    ["destinationEstablishmentId", input.destinationEstablishmentId],
  ] as const) {
    if (!id || !ctx.knownEstablishmentIds.includes(id)) {
      add("missing_establishment", "Pick an employer from your list.", field);
    }
  }

  if (!(input.amount > 0)) {
    add("non_positive_amount", "Transfer amount must be greater than zero.", "amount");
  } else if (input.amount > ctx.availableBalance && !input.adjustmentReason) {
    add(
      "exceeds_balance",
      "That is more than this employer holds. Add a reason to record it as an adjustment.",
      "amount"
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    add("invalid_date", "Enter a valid transfer date.", "date");
  } else if (input.date > ctx.todayKey) {
    add("future_date", "Transfer date cannot be in the future.", "date");
  }

  return issues;
}

export function transferHasErrors(issues: EpfTransferIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/**
 * Only an unsettled transfer can settle.
 *
 * This is the idempotency guard: a replayed completion finds the transfer
 * already `completed` and is refused rather than applying the amount twice.
 */
export function canCompleteTransfer(transfer: Pick<EpfTransfer, "status">): boolean {
  return transfer.status === "initiated";
}

export function canFailTransfer(transfer: Pick<EpfTransfer, "status">): boolean {
  return transfer.status === "initiated";
}

/** Only a settled, not-already-reversed transfer can be reversed. */
export function canReverseTransfer(
  transfer: Pick<EpfTransfer, "status" | "reversedBy" | "reversalOf">
): boolean {
  if (transfer.status !== "completed") return false;
  if (transfer.reversedBy) return false;
  // A compensating row is not itself reversible — reverse the original instead.
  if (transfer.reversalOf) return false;
  return true;
}

/**
 * The compensating transfer for a reversal.
 *
 * A new row in the opposite direction rather than deleting or flipping the
 * original, so the ledger keeps both halves and the history stays auditable —
 * the ticket's explicit requirement.
 */
export function buildReversal(
  transfer: EpfTransfer,
  date: string,
  reason: string
): Omit<EpfTransfer, "id" | "createdAt" | "updatedAt" | "statusUpdatedAt"> {
  return {
    sourceEstablishmentId: transfer.destinationEstablishmentId,
    destinationEstablishmentId: transfer.sourceEstablishmentId,
    amount: transfer.amount,
    date,
    status: "completed",
    reversalOf: transfer.id,
    statusReason: reason,
    reference: transfer.reference,
  };
}

/** What the UI shows. `reversed` is derived, never stored. */
export function transferDisplayState(
  transfer: Pick<EpfTransfer, "status" | "reversedBy">
): EpfTransferDisplayState {
  if (transfer.reversedBy) return "reversed";
  return transfer.status;
}

export function isTransferReconciled(transfer: Pick<EpfTransfer, "reconciledAt">): boolean {
  return Boolean(transfer.reconciledAt);
}

/** Single source of truth for transfer chips, so components never branch. */
export function transferStatusMeta(
  transfer: Pick<EpfTransfer, "status" | "reversedBy" | "reconciledAt">
): { label: string; tone: "neutral" | "success" | "warning" | "info"; simulated: boolean } {
  const state = transferDisplayState(transfer);
  const reconciled = isTransferReconciled(transfer);

  switch (state) {
    case "reversed":
      return { label: "Reversed", tone: "warning", simulated: false };
    case "failed":
      return { label: "Failed", tone: "warning", simulated: false };
    case "initiated":
      return { label: "Initiated", tone: "info", simulated: true };
    default:
      return reconciled
        ? { label: "Completed", tone: "success", simulated: false }
        : { label: "Completed · simulated", tone: "info", simulated: true };
  }
}

/** In, out, net and pending for one establishment. */
export function summariseTransfers(
  transfers: EpfTransfer[],
  establishmentId: string
): EpfTransferSummary {
  let transferredIn = 0;
  let transferredOut = 0;
  let pending = 0;

  for (const transfer of transfers) {
    const involved =
      transfer.sourceEstablishmentId === establishmentId ||
      transfer.destinationEstablishmentId === establishmentId;
    if (!involved) continue;

    if (transfer.status === "initiated") {
      pending += 1;
      continue;
    }
    if (transfer.status !== "completed") continue;

    if (transfer.destinationEstablishmentId === establishmentId) {
      transferredIn += transfer.amount;
    } else {
      transferredOut += transfer.amount;
    }
  }

  return {
    transferredIn: roundMoney(transferredIn),
    transferredOut: roundMoney(transferredOut),
    net: roundMoney(transferredIn - transferredOut),
    pending,
  };
}

/** Transfers touching one establishment, newest first. */
export function transfersForEstablishment(
  transfers: EpfTransfer[],
  establishmentId: string
): EpfTransfer[] {
  return transfers
    .filter(
      (transfer) =>
        transfer.sourceEstablishmentId === establishmentId ||
        transfer.destinationEstablishmentId === establishmentId
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Tolerant read — a stored shape that drifted must not crash the ledger. */
export function normalizeTransfer(id: string, raw: Record<string, unknown>): EpfTransfer {
  const str = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  const status = str(raw.status);
  return {
    id,
    sourceEstablishmentId: str(raw.sourceEstablishmentId) ?? "",
    destinationEstablishmentId: str(raw.destinationEstablishmentId) ?? "",
    amount: Math.max(0, num(raw.amount)),
    date: str(raw.date) ?? "",
    status:
      status === "completed" || status === "failed" || status === "initiated"
        ? status
        : "initiated",
    reference: str(raw.reference),
    notes: str(raw.notes),
    reconciledAt: str(raw.reconciledAt),
    reversalOf: str(raw.reversalOf),
    reversedBy: str(raw.reversedBy),
    statusReason: str(raw.statusReason),
    adjustmentReason: str(raw.adjustmentReason),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    statusUpdatedAt: raw.statusUpdatedAt,
  };
}
