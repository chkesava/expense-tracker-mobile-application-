/**
 * SPENDLY-368 — Money Decisions history: search, filters, sorting, timeline.
 *
 * Works only on the decisions the caller passes in — which come from the
 * signed-in user's own `users/{uid}/decisions` listener, itself owner-only by
 * rule — so search can never reach anyone else's records.
 *
 * Search text is built once per decision revision and cached, so typing in
 * the search box over a long history doesn't rebuild every string.
 */

import type { DecisionCategory, DecisionStatus, MoneyDecision } from "../types/decision";
import { decisionCategoryLabel } from "./decisionModel";
import { reviewState } from "./decisionCommitments";
import { monthLabel } from "./monthLabel";

export type DecisionSort = "decided" | "updated" | "created" | "title";
export type ReviewFilter = "due" | "scheduled" | "none" | "reviewed";
export type OutcomeFilter = "recorded" | "awaiting" | "not_applicable";

export interface DecisionHistoryFilters {
  query: string;
  statuses: DecisionStatus[];
  categories: DecisionCategory[];
  review: ReviewFilter[];
  outcome: OutcomeFilter[];
  /** Archived decisions are hidden unless asked for — or matched by a search. */
  includeArchived: boolean;
  sort: DecisionSort;
}

export const EMPTY_DECISION_FILTERS: DecisionHistoryFilters = {
  query: "",
  statuses: [],
  categories: [],
  review: [],
  outcome: [],
  includeArchived: false,
  sort: "decided",
};

export function countActiveDecisionFilters(f: DecisionHistoryFilters): number {
  return f.statuses.length + f.categories.length + f.review.length + f.outcome.length + (f.includeArchived ? 1 : 0);
}

/** Has the user recorded what actually happened? (369 records it.) */
export function outcomeStatus(d: MoneyDecision): OutcomeFilter {
  if (d.outcome) return "recorded";
  const live = d.status === "archived" ? d.archivedFromStatus ?? "draft" : d.status;
  return live === "draft" || live === "considering" ? "not_applicable" : "awaiting";
}

export function reviewFilterOf(d: MoneyDecision, today: string): ReviewFilter {
  const s = reviewState(d, today);
  if (s === "reviewed") return "reviewed";
  if (s === "overdue" || s === "due_today") return "due";
  if (s === "upcoming" || s === "later") return "scheduled";
  return "none";
}

/** The date a decision belongs to on the timeline: when it was made, else started. */
export function decisionTimelineMs(d: Pick<MoneyDecision, "decidedAtMs" | "createdAtMs">): number {
  return d.decidedAtMs ?? d.createdAtMs;
}

function norm(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

const searchCache = new Map<string, { key: string; text: string }>();

/**
 * Title, category, options (and which was chosen), linked records' labels,
 * constraints and the rationale — everything a person would remember a
 * decision by.
 */
export function decisionSearchText(d: MoneyDecision): string {
  const key = `${d.revision}:${d.updatedAtMs}`;
  const hit = searchCache.get(d.id);
  if (hit && hit.key === key) return hit.text;
  const text = norm(
    [
      d.title,
      decisionCategoryLabel(d.category),
      ...d.alternatives.map((a) => a.title),
      ...d.links.map((l) => l.capturedLabel),
      ...d.context.constraints,
      d.context.goal ?? "",
      d.rationale ?? "",
    ].join(" \u0001 ")
  );
  searchCache.set(d.id, { key, text });
  return text;
}

export function matchesDecisionQuery(d: MoneyDecision, query: string): boolean {
  const terms = norm(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const hay = decisionSearchText(d);
  return terms.every((t) => hay.includes(t));
}

function compare(sort: DecisionSort) {
  return (a: MoneyDecision, b: MoneyDecision) => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
      case "created":
        return b.createdAtMs - a.createdAtMs || a.id.localeCompare(b.id);
      case "updated":
        return b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id);
      case "decided":
        return decisionTimelineMs(b) - decisionTimelineMs(a) || a.id.localeCompare(b.id);
    }
  };
}

export function filterDecisions(decisions: readonly MoneyDecision[], f: DecisionHistoryFilters, today: string): MoneyDecision[] {
  const searching = f.query.trim().length > 0;
  return decisions
    .filter((d) => {
      if (d.status === "archived" && !f.includeArchived && !searching && !f.statuses.includes("archived")) return false;
      if (f.statuses.length > 0 && !f.statuses.includes(d.status)) return false;
      if (f.categories.length > 0 && !f.categories.includes(d.category)) return false;
      if (f.review.length > 0 && !f.review.includes(reviewFilterOf(d, today))) return false;
      if (f.outcome.length > 0 && !f.outcome.includes(outcomeStatus(d))) return false;
      return matchesDecisionQuery(d, f.query);
    })
    .sort(compare(f.sort));
}

export type TimelineItem =
  | { type: "header"; key: string; label: string; count: number }
  | { type: "decision"; key: string; decision: MoneyDecision };

/**
 * Month-grouped timeline in chronological order (newest month first, and
 * within a month newest first) by when each decision was made. Only used for
 * the date sorts; title sort is a flat list.
 */
export function decisionTimeline(decisions: readonly MoneyDecision[], sort: DecisionSort): TimelineItem[] {
  if (sort === "title") return decisions.map((d) => ({ type: "decision", key: d.id, decision: d }));
  const dateOf = (d: MoneyDecision) => (sort === "created" ? d.createdAtMs : sort === "updated" ? d.updatedAtMs : decisionTimelineMs(d));
  const out: TimelineItem[] = [];
  let current = "";
  let header: Extract<TimelineItem, { type: "header" }> | null = null;
  for (const d of decisions) {
    const month = new Date(dateOf(d)).toISOString().slice(0, 7);
    if (month !== current) {
      current = month;
      header = { type: "header", key: `h:${month}`, label: monthLabel(month, "long"), count: 0 };
      out.push(header);
    }
    header!.count += 1;
    out.push({ type: "decision", key: d.id, decision: d });
  }
  return out;
}
