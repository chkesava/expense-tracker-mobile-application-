import type {
  PrasadamDaySummary,
  PrasadamEntry,
  PrasadamSession,
  PrasadamSessionState,
  PrasadamSessionSummary,
  PrasadamStatus,
  PrasadamType,
  PrasadamUnit,
  PrasadamUnitTotal,
} from "@/shared/types/ganeshPrasadam";
import {
  PRASADAM_TYPE_ORDER,
  PRASADAM_UNIT_ORDER,
} from "@/shared/types/ganeshPrasadam";
import { GANESH_DATE_PATTERN, todayDateInput } from "@/shared/utils/ganeshIdentity";

/**
 * Prasadam register logic (KAN-126).
 *
 * Every rule the screens depend on lives here, because `app/` and
 * `components/` sit outside the Vitest glob — logic left in a component is
 * logic nothing can test.
 *
 * Dates are ISO `yyyy-mm-dd` compared lexically, exactly as `ganeshSeva.ts`
 * does. No Date objects, no timezone maths: a pandal's morning is local
 * wall-clock time, and routing it through UTC is how an offering lands on the
 * wrong day.
 */

const DATE_PATTERN = GANESH_DATE_PATTERN;

/** Ordered, and the order is meaningful: morning is always shown first. */
export const PRASADAM_SESSIONS: readonly PrasadamSession[] = [
  "morning",
  "evening",
] as const;

/**
 * The clock boundary between the two sessions. Used only to pick a sensible
 * default in the form and to decide whether a session is late — never to
 * reject an entry. A pandal that serves its "morning" prasadam at 1pm is not
 * making a mistake the app should argue with.
 */
export const PRASADAM_EVENING_FROM = "12:00";

const MAX_PROVIDER_NAME = 80;
const MAX_LABEL = 60;
const MAX_NOTES = 500;
const MAX_QUANTITY = 100000;

/* ------------------------------------------------------------- Labels */

export function prasadamSessionLabel(session: PrasadamSession): string {
  return session === "morning" ? "Morning" : "Evening";
}

/** The window as a committee would say it, for a card subtitle. */
export function prasadamSessionWindowLabel(session: PrasadamSession): string {
  return session === "morning" ? "Before noon" : "After noon";
}

export function prasadamUnitLabel(
  unit: PrasadamUnit,
  unitLabel?: string
): string {
  if (unit === "other") return unitLabel?.trim() || "units";
  return unit;
}

export function prasadamTypeLabel(type: PrasadamType): string {
  switch (type) {
    case "sweet":
      return "Sweet";
    case "savoury":
      return "Savoury";
    case "fruit":
      return "Fruit";
    case "meal":
      return "Meal";
    case "drink":
      return "Drink";
    case "laddu":
      return "Laddu";
    default:
      return "Other";
  }
}

/**
 * "500 pieces", "5.5 kg".
 *
 * Rounds to 2dp through its own helper rather than borrowing `money()` from
 * `ganeshMath` — this is not currency, and reaching for the money formatter is
 * exactly how an in-kind quantity later gets rendered with a rupee sign.
 */
export function formatPrasadamQuantity(
  quantity: number,
  unit: PrasadamUnit,
  unitLabel?: string
): string {
  return `${roundQuantity(quantity)} ${prasadamUnitLabel(unit, unitLabel)}`;
}

export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------- Status */

export function prasadamStatusOf(
  entry?: Pick<PrasadamEntry, "status"> | null
): PrasadamStatus {
  return entry?.status === "cancelled" ? "cancelled" : "recorded";
}

/** Active means it counts towards the day's totals. */
export function isPrasadamActive(
  entry?: Pick<PrasadamEntry, "status" | "voided"> | null
): boolean {
  if (!entry) return false;
  if (entry.voided) return false;
  return prasadamStatusOf(entry) === "recorded";
}

/* ------------------------------------------------------------ Selection */

export function entriesForSession(
  entries: readonly PrasadamEntry[],
  date: string,
  session: PrasadamSession
): PrasadamEntry[] {
  return entries.filter((e) => e.date === date && e.session === session);
}

/** Every date that has at least one entry, ascending. */
export function prasadamDates(entries: readonly PrasadamEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.date) seen.add(entry.date);
  }
  return [...seen].sort();
}

/**
 * Where a session sits relative to the clock.
 *
 * Derived rather than stored, so nobody has to remember to close anything. A
 * past session with no entries is `missed` rather than `not-started`, because
 * "nobody brought prasadam that evening" is a fact worth showing, not a
 * pending action.
 */
export function prasadamSessionState(
  entries: readonly PrasadamEntry[],
  date: string,
  session: PrasadamSession,
  today = todayDateInput(),
  nowTime = currentClock()
): PrasadamSessionState {
  const forSession = entriesForSession(entries, date, session);
  const active = forSession.filter(isPrasadamActive);

  if (active.length > 0) {
    if (date < today) return "recorded";
    return "in-progress";
  }
  if (forSession.length > 0) return "cancelled";
  if (date < today) return "missed";
  if (date > today) return "not-started";
  // Today, nothing recorded: the evening has not begun until noon.
  if (session === "evening" && nowTime < PRASADAM_EVENING_FROM) {
    return "not-started";
  }
  return "not-started";
}

/**
 * True when a session on *today* is past its window with nothing recorded —
 * the one case worth nudging the committee about.
 */
export function isPrasadamSessionLate(
  entries: readonly PrasadamEntry[],
  date: string,
  session: PrasadamSession,
  today = todayDateInput(),
  nowTime = currentClock()
): boolean {
  if (date !== today) return false;
  if (entriesForSession(entries, date, session).some(isPrasadamActive)) {
    return false;
  }
  return session === "morning"
    ? nowTime >= PRASADAM_EVENING_FROM
    : nowTime >= "20:00";
}

/** The session a form should default to, given the clock. */
export function defaultPrasadamSession(
  nowTime = currentClock()
): PrasadamSession {
  return nowTime < PRASADAM_EVENING_FROM ? "morning" : "evening";
}

/* ------------------------------------------------------------ Summaries */

/**
 * Distinct-provider identity.
 *
 * A linked provider is identified by the link. An unlinked one is identified by
 * name + mobile, normalised, so "Ravi" and "ravi " are one person across two
 * entries — but "Ravi" with no mobile and "Ravi" with one are deliberately kept
 * apart rather than guessed at.
 */
function providerKey(entry: PrasadamEntry): string {
  if (entry.providerId) return `id:${entry.providerId}`;
  const name = entry.providerName?.trim().toLowerCase() ?? "";
  const mobile = entry.mobile?.replace(/\D/g, "") ?? "";
  return `n:${name}|${mobile}`;
}

/**
 * Per-unit totals for a set of entries.
 *
 * Cancelled entries are excluded from the quantities and counted separately, so
 * a reversal visibly reduces the total without erasing the row.
 *
 * There is no `totalQuantity` in the result, and there must never be one:
 * "5 kg + 30 pieces" has no single value, and an API that returned one would be
 * wrong in a way nobody notices until the report is printed.
 */
export function summarizePrasadamEntries(
  entries: readonly PrasadamEntry[]
): PrasadamSessionSummary {
  const active = entries.filter(isPrasadamActive);
  const cancelledCount = entries.length - active.length;

  const providers = new Set<string>();
  for (const entry of active) providers.add(providerKey(entry));

  const unitBuckets = new Map<string, PrasadamUnitTotal>();
  for (const entry of active) {
    const unit = entry.unit ?? "other";
    // `other` groups by the pandal's own word, normalised, so "dabba" and
    // "Dabba" land together. The first spelling seen is the one displayed.
    const labelKey =
      unit === "other" ? (entry.unitLabel?.trim().toLowerCase() ?? "") : "";
    const key = `${unit}|${labelKey}`;
    const existing = unitBuckets.get(key);
    const quantity = Number.isFinite(entry.quantity) ? entry.quantity : 0;
    if (existing) {
      existing.quantity = roundQuantity(existing.quantity + quantity);
      existing.entryCount += 1;
    } else {
      unitBuckets.set(key, {
        unit,
        unitLabel: unit === "other" ? entry.unitLabel?.trim() : undefined,
        quantity: roundQuantity(quantity),
        entryCount: 1,
      });
    }
  }

  const byUnit = [...unitBuckets.values()].sort((a, b) => {
    const ai = PRASADAM_UNIT_ORDER.indexOf(a.unit);
    const bi = PRASADAM_UNIT_ORDER.indexOf(b.unit);
    if (ai !== bi) return ai - bi;
    return (a.unitLabel ?? "").localeCompare(b.unitLabel ?? "");
  });

  const typeCounts = new Map<PrasadamType, number>();
  for (const entry of active) {
    const type = entry.prasadamType ?? "other";
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }
  const byType = [...typeCounts.entries()]
    .map(([type, entryCount]) => ({ type, entryCount }))
    .sort(
      (a, b) =>
        PRASADAM_TYPE_ORDER.indexOf(a.type) - PRASADAM_TYPE_ORDER.indexOf(b.type)
    );

  return {
    entryCount: active.length,
    providerCount: providers.size,
    cancelledCount,
    byUnit,
    byType,
  };
}

export function summarizePrasadamSession(
  entries: readonly PrasadamEntry[],
  date: string,
  session: PrasadamSession
): PrasadamSessionSummary {
  return summarizePrasadamEntries(entriesForSession(entries, date, session));
}

/**
 * One day, both sessions.
 *
 * `providerCount` is distinct across the day, not morning + evening — someone
 * who provides at both sessions is one person who fed the pandal twice, and
 * reporting them as two would overstate how many households are involved.
 */
export function summarizePrasadamDay(
  entries: readonly PrasadamEntry[],
  date: string,
  dayNumber?: number
): PrasadamDaySummary {
  const forDay = entries.filter((e) => e.date === date);
  const morning = summarizePrasadamEntries(
    forDay.filter((e) => e.session === "morning")
  );
  const evening = summarizePrasadamEntries(
    forDay.filter((e) => e.session === "evening")
  );
  const providers = new Set<string>();
  for (const entry of forDay.filter(isPrasadamActive)) {
    providers.add(providerKey(entry));
  }
  return {
    date,
    dayNumber,
    morning,
    evening,
    providerCount: providers.size,
    entryCount: morning.entryCount + evening.entryCount,
  };
}

/** History grouping: newest day first, morning before evening within a day. */
export function groupPrasadamByDay(
  entries: readonly PrasadamEntry[]
): Array<{
  date: string;
  morning: PrasadamEntry[];
  evening: PrasadamEntry[];
  summary: PrasadamDaySummary;
}> {
  const dates = prasadamDates(entries).sort((a, b) => b.localeCompare(a));
  return dates.map((date) => {
    const forDay = entries.filter((e) => e.date === date);
    return {
      date,
      morning: sortWithinSession(forDay.filter((e) => e.session === "morning")),
      evening: sortWithinSession(forDay.filter((e) => e.session === "evening")),
      summary: summarizePrasadamDay(entries, date),
    };
  });
}

/**
 * Stable order within a session: oldest first, so the register reads in the
 * order people actually arrived, and a re-render never reshuffles it.
 * Falls back to the id when two entries share a timestamp or neither has one
 * yet (an offline write has no server time until it syncs).
 */
export function sortWithinSession(entries: readonly PrasadamEntry[]): PrasadamEntry[] {
  return [...entries].sort((a, b) => {
    const at = timeValue(a.createdAt);
    const bt = timeValue(b.createdAt);
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });
}

function timeValue(value: PrasadamEntry["createdAt"]): number {
  if (!value) return 0;
  const seconds = (value as { seconds?: number }).seconds;
  if (typeof seconds === "number") return seconds;
  const toDate = (value as { toDate?: () => Date }).toDate;
  if (typeof toDate === "function") {
    try {
      return toDate.call(value).getTime() / 1000;
    } catch {
      return 0;
    }
  }
  return 0;
}

/* -------------------------------------------------------------- Filter */

export interface PrasadamFilter {
  search?: string;
  session?: PrasadamSession | "all";
  date?: string;
  status?: PrasadamStatus | "all";
}

/**
 * History filtering, in memory.
 *
 * Deliberately not a Firestore query: `where('session','==',x)` combined with
 * `orderBy('date')` needs a composite index, and `firestore.indexes.json` is a
 * strict subset of the live project — deploying it deletes anything absent
 * (`docs/KAN-75-epf-index-query-review.md`).
 *
 * Each predicate is independent. Coupling search to status is what produced two
 * shipped filter bugs recorded in `docs/GANESH_SEVA_UI_REDESIGN.md`.
 */
export function filterPrasadam(
  entries: readonly PrasadamEntry[],
  filter: PrasadamFilter = {}
): PrasadamEntry[] {
  const needle = filter.search?.trim().toLowerCase() ?? "";
  const digits = needle.replace(/\D/g, "");

  return entries.filter((entry) => {
    if (filter.date && entry.date !== filter.date) return false;

    if (filter.session && filter.session !== "all") {
      if (entry.session !== filter.session) return false;
    }

    if (filter.status && filter.status !== "all") {
      if (prasadamStatusOf(entry) !== filter.status) return false;
    }

    if (!needle) return true;
    const haystack = [
      entry.providerName,
      entry.prasadamLabel,
      prasadamTypeLabel(entry.prasadamType),
      entry.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystack.includes(needle)) return true;
    if (digits && entry.mobile?.replace(/\D/g, "").includes(digits)) return true;
    return false;
  });
}

/* ------------------------------------------------------------ Validation */

export interface PrasadamDraft {
  date?: string;
  session?: PrasadamSession;
  providerName?: string;
  mobile?: string;
  prasadamType?: PrasadamType;
  prasadamLabel?: string;
  quantity?: number | string;
  unit?: PrasadamUnit;
  unitLabel?: string;
  notes?: string;
}

export type PrasadamValidation = { ok: true } | { ok: false; error: string };

/**
 * Same `{ok}` contract as `validateSeva`, so it can drive a disabled Button
 * directly.
 *
 * Messages name what to do, not what is wrong with the input — the form shows
 * these to a volunteer standing at a counter, not to a developer.
 */
export function validatePrasadamEntry(draft: PrasadamDraft): PrasadamValidation {
  const name = draft.providerName?.trim() ?? "";
  if (!name) {
    return { ok: false, error: "Add the provider's name to record this entry." };
  }
  if (name.length > MAX_PROVIDER_NAME) {
    return { ok: false, error: "That name is too long." };
  }

  if (!draft.date || !DATE_PATTERN.test(draft.date)) {
    return { ok: false, error: "Pick the festival day this was offered on." };
  }

  if (draft.session !== "morning" && draft.session !== "evening") {
    return { ok: false, error: "Choose the morning or the evening session." };
  }

  const quantity = normalizeQuantity(draft.quantity);
  if (quantity === null) {
    return { ok: false, error: "Quantity must be a number." };
  }
  if (quantity <= 0) {
    return { ok: false, error: "Enter how much was offered." };
  }
  if (quantity > MAX_QUANTITY) {
    return { ok: false, error: "That quantity looks too large to be right." };
  }

  if (!draft.unit) {
    return { ok: false, error: "Choose a unit for the quantity." };
  }
  if (draft.unit === "other" && !draft.unitLabel?.trim()) {
    return { ok: false, error: "Name the unit you are counting in." };
  }

  if ((draft.prasadamLabel?.trim().length ?? 0) > MAX_LABEL) {
    return { ok: false, error: "That prasadam name is too long." };
  }
  if ((draft.notes?.trim().length ?? 0) > MAX_NOTES) {
    return { ok: false, error: "That note is too long." };
  }

  return { ok: true };
}

/** Accepts the string a TextInput gives us; `null` means "not a number". */
export function normalizeQuantity(value: number | string | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const raw = value?.trim();
  if (!raw) return 0;
  if (!/^\d*\.?\d*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Does this provider already appear in this session today?
 *
 * A warning, never a block — the same person legitimately brings two different
 * items to one session, and the ticket requires that to be recordable.
 */
export function findDuplicateProvider(
  entries: readonly PrasadamEntry[],
  date: string,
  session: PrasadamSession,
  provider: { providerId?: string; providerName?: string; mobile?: string }
): PrasadamEntry | undefined {
  const key = providerKey({
    providerId: provider.providerId,
    providerName: provider.providerName ?? "",
    mobile: provider.mobile,
  } as PrasadamEntry);
  return entriesForSession(entries, date, session)
    .filter(isPrasadamActive)
    .find((entry) => providerKey(entry) === key);
}

/* --------------------------------------------------------- State guards */

/**
 * Edit and cancel guards, pure and here rather than in the service, exactly as
 * `assertCanCancelContribution` lives in `ganeshContributions.ts`.
 *
 * Cancellation is terminal in both directions: a cancelled entry can neither be
 * edited nor un-cancelled. Correcting a mistaken cancellation means recording a
 * fresh entry, which leaves the correction in the audit trail instead of
 * quietly rewriting history.
 */
export function assertCanEditPrasadamEntry(
  entry?: Pick<PrasadamEntry, "status" | "voided"> | null
): void {
  if (!entry) {
    throw new Error("That prasadam entry is no longer here.");
  }
  if (!isPrasadamActive(entry)) {
    throw new Error(
      "This entry was cancelled and cannot be edited. Record a new entry instead."
    );
  }
}

export function assertCanCancelPrasadamEntry(
  entry?: Pick<PrasadamEntry, "status" | "voided"> | null
): void {
  if (!entry) {
    throw new Error("That prasadam entry is no longer here.");
  }
  if (!isPrasadamActive(entry)) {
    throw new Error("This entry has already been cancelled.");
  }
}

/** Local wall-clock `HH:mm`, mirroring `currentTimeInput` in ganeshSeva. */
export function currentClock(now = new Date()): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
