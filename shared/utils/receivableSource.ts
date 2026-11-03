import type {
  Receivable,
  ReceivableSourceMode,
} from "../types/receivable";

/**
 * SPENDLY-668: where the money for a lend came from.
 *
 * The "Paid From Account" picker holds either an account id or
 * `LEND_SOURCE_ALREADY_DEDUCTED`. A lend with no account moves no balance,
 * because `ledgerRowAccountDeltas` skips a leg without an account id; the mode
 * just records that this was deliberate rather than missing.
 */
export const LEND_SOURCE_ALREADY_DEDUCTED = "__already_deducted__";

export type LendSourceFields = {
  sourceMode: ReceivableSourceMode;
  sourceAccountId: string | null;
};

export type LendSourceResult =
  | { ok: true; fields: LendSourceFields }
  | { ok: false; error: string };

/** Maps the picker's selection to the stored fields, or a validation error. */
export function resolveLendSource(selection: string): LendSourceResult {
  if (selection === LEND_SOURCE_ALREADY_DEDUCTED) {
    return {
      ok: true,
      fields: { sourceMode: "already_deducted", sourceAccountId: null },
    };
  }
  const accountId = selection.trim();
  if (!accountId) {
    return {
      ok: false,
      error:
        "Select the account the money was paid from, or None if it was already deducted",
    };
  }
  return { ok: true, fields: { sourceMode: "account", sourceAccountId: accountId } };
}

export function isAlreadyDeducted(
  r: Pick<Receivable, "sourceMode">
): boolean {
  return r.sourceMode === "already_deducted";
}

/**
 * Normalises the source fields before a write so an "already deducted" lend
 * can never carry an account id, and so can never debit one, whatever an
 * edit payload or a retry sends.
 */
export function normalizeLendSource<
  T extends Pick<Receivable, "sourceMode" | "sourceAccountId">,
>(row: T): T {
  if (row.sourceMode === "already_deducted" && row.sourceAccountId != null) {
    return { ...row, sourceAccountId: null };
  }
  return row;
}

/**
 * The source mode is fixed when the lend is recorded. An edit (or a retried
 * edit) can't switch it, and can't attach an account to an "already
 * deducted" lend, so editing one never applies a debit. Account-backed lends
 * keep their existing edit behaviour.
 */
export function lockLendSource<T extends Partial<Receivable>>(
  existing: Pick<Receivable, "sourceMode">,
  updates: T
): T {
  if (!("sourceMode" in updates) && !("sourceAccountId" in updates)) {
    return updates;
  }
  const { sourceMode: _mode, ...rest } = updates;
  if (!isAlreadyDeducted(existing)) return rest as T;
  const { sourceAccountId: _account, ...locked } = rest;
  return locked as T;
}
