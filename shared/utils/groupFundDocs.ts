/**
 * SPENDLY-685 — Group Funds documents as the app uses them, from either
 * source (a Firestore snapshot or the read-model copy), and history ordering.
 * Pure: no React Native, no Firestore.
 */

import type { Account } from "../types/expense";
import type { GroupFund, GroupFundEvent, GroupFundTotals } from "../types/groupFund";
import { getAccountKind } from "./accountKind";
import { emptyGroupFundTotals, isGroupFundEventKind, isGroupFundStatus } from "./groupFundModel";

/** Newest page of a fund's history kept live; older pages load on demand. */
export const GROUP_FUND_HISTORY_PAGE_SIZE = 25;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function totalsFrom(value: unknown): GroupFundTotals {
  const base = emptyGroupFundTotals();
  if (!isRecord(value)) return base;
  for (const key of Object.keys(base) as (keyof GroupFundTotals)[]) {
    const v = value[key];
    if (typeof v === "number" && Number.isFinite(v)) base[key] = v;
  }
  return base;
}

function numberMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(value)) return out;
  for (const [k, v] of Object.entries(value)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

/** A fund document, or null if it doesn't look like one. Display only: writers load from Firestore. */
export function groupFundFromDoc(id: string, data: Record<string, unknown> | undefined): GroupFund | null {
  if (!data || typeof data.name !== "string" || !Array.isArray(data.purposes)) return null;
  const byPurpose: Record<string, GroupFundTotals> = {};
  if (isRecord(data.byPurpose)) {
    for (const [purposeId, totals] of Object.entries(data.byPurpose)) byPurpose[purposeId] = totalsFrom(totals);
  }
  return {
    id,
    name: data.name,
    notes: typeof data.notes === "string" ? data.notes : undefined,
    status: isGroupFundStatus(data.status) ? data.status : "active",
    purposes: (data.purposes as GroupFund["purposes"]).filter((p) => isRecord(p) && typeof p.id === "string"),
    members: Array.isArray(data.members)
      ? (data.members as GroupFund["members"]).filter((m) => isRecord(m) && typeof m.id === "string")
      : [],
    totals: totalsFrom(data.totals),
    byPurpose,
    heldByAccount: numberMap(data.heldByAccount),
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : undefined,
    version: typeof data.version === "number" ? data.version : undefined,
    lastEventId: typeof data.lastEventId === "string" ? data.lastEventId : undefined,
    createdAtMs: typeof data.createdAtMs === "number" ? data.createdAtMs : undefined,
  };
}

/** An event document, or null if it doesn't look like one. */
export function groupFundEventFromDoc(id: string, data: Record<string, unknown> | undefined): GroupFundEvent | null {
  if (!data || typeof data.fundId !== "string" || !isGroupFundEventKind(data.kind)) return null;
  if (typeof data.amount !== "number" || typeof data.createdAtMs !== "number") return null;
  return { ...(data as Omit<GroupFundEvent, "id">), id };
}

/** Active funds first, then by name. */
export function sortGroupFunds(funds: readonly GroupFund[]): GroupFund[] {
  return [...funds].sort(
    (a, b) =>
      Number(a.status === "archived") - Number(b.status === "archived") ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  );
}

/** Newest first; ties by id, descending (the read model's keyset order). */
export function sortGroupFundEvents(events: readonly GroupFundEvent[]): GroupFundEvent[] {
  return [...events].sort((a, b) => b.createdAtMs - a.createdAtMs || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/**
 * SPENDLY-687: accounts group money can move through — bank, cash or wallet,
 * never a credit card (the store refuses one too). Sorted by name.
 */
export function groupFundAccountOptions(
  accounts: readonly Pick<Account, "id" | "name" | "typeId">[],
  typeNameById: ReadonlyMap<string, string>
): { id: string; name: string }[] {
  return accounts
    .filter((a) => getAccountKind(typeNameById.get(a.typeId) ?? "") !== "credit")
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
