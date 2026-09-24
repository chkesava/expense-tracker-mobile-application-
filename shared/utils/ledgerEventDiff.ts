/**
 * SPENDLY-110 — turning an audit event into something a person can read.
 *
 * `LedgerEvent` stores a full `before` snapshot and a full `after` snapshot
 * (SPENDLY-38). That is the right thing to store — it survives schema drift and
 * needs no migration — but it is useless on screen: showing two complete
 * records side by side makes the reader find the difference themselves.
 *
 * These helpers reduce a pair of snapshots to the fields that actually changed,
 * so the audit trail can say "amount 500 → 650" instead of reprinting the row.
 *
 * Kept pure and free of React so the comparison logic is testable; vitest only
 * collects `shared|services|lib|scripts|supabase`.
 */

import type {
  LedgerEvent,
  LedgerEventSnapshot,
} from "@/shared/types/ledgerEvent";

/** A field whose value differs between two snapshots. */
export interface LedgerFieldChange {
  field: keyof LedgerEventSnapshot;
  /** Human label for the field, e.g. `accountId` → "Account". */
  label: string;
  before: string | number | undefined;
  after: string | number | undefined;
  /** True when the field holds money, so callers can format it as currency. */
  isMoney: boolean;
}

/**
 * Field order is display order — the fields a person checks first come first,
 * and the provenance fields come last because they change rarely and matter
 * only when something looks wrong.
 */
const FIELD_LABELS: Array<{
  field: keyof LedgerEventSnapshot;
  label: string;
  isMoney?: boolean;
}> = [
  { field: "amount", label: "Amount", isMoney: true },
  { field: "date", label: "Date" },
  { field: "category", label: "Category" },
  { field: "subcategory", label: "Subcategory" },
  { field: "source", label: "Source" },
  { field: "note", label: "Note" },
  { field: "accountId", label: "Account" },
  { field: "tags", label: "Tags" },
  { field: "month", label: "Month" },
  { field: "spaceId", label: "Space" },
  { field: "tripId", label: "Trip" },
  { field: "splitId", label: "Split" },
  { field: "subscriptionId", label: "Subscription" },
  { field: "smsFingerprint", label: "SMS fingerprint" },
  { field: "smsExternalRef", label: "SMS reference" },
];

/**
 * Normalize a snapshot value for comparison and display.
 *
 * `null` and `""` both mean "not set" on these records — `accountId` is
 * `string | null` while `note` is `""` — so they must compare equal, or every
 * event would report a spurious change. Tags are compared as a stable joined
 * string so reordering alone is not a change.
 */
function normalizeValue(
  value: LedgerEventSnapshot[keyof LedgerEventSnapshot]
): string | number | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const joined = [...value].filter(Boolean).sort().join(", ");
    return joined || undefined;
  }
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * The fields that differ between two snapshots, in display order.
 *
 * A `null` `after` means a delete, which is not a field-level change — callers
 * render that as its own thing, so this returns no changes rather than
 * reporting every field as cleared.
 */
export function diffLedgerSnapshots(
  before: LedgerEventSnapshot,
  after: LedgerEventSnapshot | null
): LedgerFieldChange[] {
  if (!after) return [];

  const changes: LedgerFieldChange[] = [];
  for (const { field, label, isMoney } of FIELD_LABELS) {
    const beforeValue = normalizeValue(before[field]);
    const afterValue = normalizeValue(after[field]);
    if (beforeValue === afterValue) continue;
    changes.push({
      field,
      label,
      before: beforeValue,
      after: afterValue,
      isMoney: isMoney === true,
    });
  }
  return changes;
}

/** Convenience: the changes carried by one event. */
export function diffLedgerEvent(event: LedgerEvent): LedgerFieldChange[] {
  return diffLedgerSnapshots(event.before, event.after);
}

export type LedgerEventSummaryTone = "removed" | "restored" | "edited";

export interface LedgerEventSummary {
  tone: LedgerEventSummaryTone;
  /** Short label for a chip, e.g. "Deleted". */
  label: string;
  /** One line describing what happened, e.g. "Amount, Note changed". */
  detail: string;
  changes: LedgerFieldChange[];
}

/**
 * Summarize one event for display.
 *
 * `action` is a stored string union, so a client running older code may have
 * written — or a newer client may yet write — a value this build does not know.
 * Anything unrecognised is treated as an edit rather than dropped, so the audit
 * trail never silently hides history it cannot name.
 */
export function summarizeLedgerEvent(event: LedgerEvent): LedgerEventSummary {
  const changes = diffLedgerEvent(event);

  if (event.action === "delete") {
    return {
      tone: "removed",
      label: "Deleted",
      detail: event.reason?.trim() || "Removed from the ledger",
      changes: [],
    };
  }
  if (event.action === "restore") {
    return {
      tone: "restored",
      label: "Restored",
      detail: event.reason?.trim() || "Returned to the ledger",
      changes,
    };
  }

  const detail =
    changes.length === 0
      ? "Saved with no visible change"
      : `${changes.map((change) => change.label).join(", ")} changed`;

  return {
    tone: "edited",
    label: "Edited",
    detail: event.reason?.trim() || detail,
    changes,
  };
}

/**
 * Events belonging to one ledger row, newest first.
 *
 * `useLedgerEvents` already orders by `createdAt` descending, so this only
 * filters — resorting would risk disagreeing with the server's ordering for
 * events written in the same millisecond.
 */
export function selectEventsForRow(
  events: LedgerEvent[],
  kind: LedgerEvent["kind"],
  docId: string | undefined
): LedgerEvent[] {
  if (!docId) return [];
  return events.filter(
    (event) => event.docId === docId && event.kind === kind
  );
}
