/**
 * SPENDLY-609 — a goal's history timeline: how each audit event reads, which
 * entries can be corrected, and the quick-add amounts. Pure; the screen only
 * formats money and renders.
 */

import type { GoalEvent, GoalReason, GoalStatus } from "../types/goal";
import { GOAL_STATUS_LABELS } from "./goalMessages";

/** Newest-first page size for a goal's history (cursor paged). */
export const GOAL_HISTORY_PAGE_SIZE = 25;

/** FRD FR-03 quick amounts. */
export const GOAL_QUICK_AMOUNTS = [100, 500, 1000] as const;

export const GOAL_REASON_LABELS: Record<GoalReason, string> = {
  salary: "Salary",
  savings: "Savings",
  bonus: "Bonus",
  gift: "Gift",
  other: "Other",
};

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  description: "description",
  iconKey: "icon",
  startDate: "start date",
  targetDate: "target date",
  minimumContribution: "minimum contribution",
  milestones: "milestones",
};

const STATUS_VERBS: Partial<Record<GoalStatus, string>> = {
  paused: "Paused",
  cancelled: "Cancelled",
  archived: "Archived",
};

export type GoalEventView = {
  title: string;
  /** Extra line (reason, note, what changed). Money placeholders are filled by the UI. */
  detail?: string;
  /** Signed change to show, or null when the entry moves no money. */
  amount: number | null;
  /** Amounts the detail mentions, in order, for the UI to format (target before/after, milestone). */
  amounts?: number[];
  tone: "positive" | "negative" | "neutral";
};

function statusTitle(e: GoalEvent): string {
  const to = e.statusAfter;
  if (!to) return "Status changed";
  if (to === "active") {
    if (e.statusBefore === "paused") return "Resumed";
    if (e.statusBefore === "completed") return "Reopened";
    if (e.statusBefore === "cancelled") return "Restored";
    if (e.statusBefore === "archived") return "Unarchived";
    return "Active";
  }
  if (e.statusBefore === "archived") return `Unarchived (${GOAL_STATUS_LABELS[to].toLowerCase()})`;
  return STATUS_VERBS[to] ?? GOAL_STATUS_LABELS[to];
}

export function describeGoalEvent(e: GoalEvent): GoalEventView {
  const reason = e.reason ? GOAL_REASON_LABELS[e.reason] : undefined;
  const extra = [reason, e.note].filter(Boolean).join(" · ") || undefined;
  const tone = e.amountDelta > 0 ? "positive" : e.amountDelta < 0 ? "negative" : "neutral";
  switch (e.type) {
    case "created":
      return { title: e.amountDelta > 0 ? "Goal created with a starting amount" : "Goal created", amount: e.amountDelta || null, tone };
    case "migrated":
      return { title: "History started", detail: "Amounts saved before this point are the goal's opening balance.", amount: null, tone: "neutral" };
    case "contribution":
      return { title: "Added", detail: extra, amount: e.amountDelta, tone };
    case "reduction":
      return { title: "Taken out", detail: extra, amount: e.amountDelta, tone };
    case "correction":
      return { title: "Correction to an earlier entry", detail: extra, amount: e.amountDelta, tone };
    case "reversal":
      return { title: "Earlier entry reversed", detail: extra, amount: e.amountDelta, tone };
    case "target_changed":
      return { title: "Target changed", detail: "{0} → {1}", amounts: [e.targetBefore ?? 0, e.targetAfter ?? 0], amount: null, tone: "neutral" };
    case "status_changed":
      return { title: statusTitle(e), amount: null, tone: "neutral" };
    case "completed":
      return { title: "Goal completed", amount: null, tone: "positive" };
    case "edited": {
      const fields = (e.changedFields ?? []).map((f) => FIELD_LABELS[f] ?? f);
      return { title: "Details edited", detail: fields.length ? `Changed ${fields.join(", ")}` : undefined, amount: null, tone: "neutral" };
    }
    case "milestone_reached":
      return { title: "Milestone reached", detail: "{0}", amounts: [e.milestoneAmount ?? 0], amount: null, tone: "positive" };
    case "milestone_lost":
      return { title: "Dropped below a milestone", detail: "{0}", amounts: [e.milestoneAmount ?? 0], amount: null, tone: "neutral" };
  }
}

/** Fill `{0}`, `{1}`… in a detail line with formatted amounts. */
export function fillAmounts(text: string, amounts: readonly number[] | undefined, format: (n: number) => string): string {
  return text.replace(/\{(\d+)\}/g, (_, i) => format(amounts?.[Number(i)] ?? 0));
}

/**
 * Whether the timeline offers "Correct / reverse" on this entry. The final
 * word is the builder plus rules (which also see entries on unloaded pages).
 */
export function canOfferCorrection(e: GoalEvent, loaded: readonly GoalEvent[]): boolean {
  if (!(e.type === "created" || e.type === "contribution" || e.type === "reduction")) return false;
  if (!e.amountDelta) return false;
  return !loaded.some((x) => x.type === "reversal" && x.correctionOf === e.id);
}

/** Events linked to `id` among those already loaded (a starting point; the hook re-reads them). */
export function linkedCorrections(id: string, loaded: readonly GoalEvent[]): GoalEvent[] {
  return loaded.filter((x) => (x.type === "correction" || x.type === "reversal") && x.correctionOf === id);
}

/** Newest first; ties broken by id so every device shows the same order. */
export function sortGoalEvents(events: readonly GoalEvent[]): GoalEvent[] {
  return [...events].sort((a, b) => b.createdAtMs - a.createdAtMs || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
