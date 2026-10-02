/**
 * SPENDLY-367 — commitments, review dates and follow-up for Money Decisions.
 *
 * Commitments are actions, not money: nothing here reads or writes a
 * transaction. Progress on actions is reported separately from — and never
 * as — the outcome of the decision.
 */

import { DECISION_LIMITS, type DecisionCommitment, type MoneyDecision } from "../types/decision";
import { daysBetweenDateKeys } from "./dates";

/** Within this many days counts as "coming up". */
export const UPCOMING_DAYS = 7;

export type DueState = "overdue" | "due_today" | "upcoming" | "later" | "no_date";
export type CommitmentState = DueState | "done" | "dropped";
export type ReviewState = DueState | "reviewed" | "not_applicable";

export function dueStateFor(date: string | undefined, today: string): DueState {
  if (!date) return "no_date";
  const days = daysBetweenDateKeys(today, date);
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= UPCOMING_DAYS) return "upcoming";
  return "later";
}

export function commitmentState(c: DecisionCommitment, today: string): CommitmentState {
  if (c.status === "done") return "done";
  if (c.status === "dropped") return "dropped";
  return dueStateFor(c.targetDate, today);
}

/**
 * Review is due while the decision is decided or being tracked. Once
 * reviewed/closed it's done; drafts and archived decisions have no review due.
 */
export function reviewState(d: Pick<MoneyDecision, "status" | "reviewDate">, today: string): ReviewState {
  if (d.status === "reviewed" || d.status === "closed") return "reviewed";
  if (d.status !== "decided" && d.status !== "tracking") return "not_applicable";
  return dueStateFor(d.reviewDate, today);
}

export const DUE_LABELS: Record<CommitmentState | ReviewState, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Coming up",
  later: "Later",
  no_date: "No date",
  done: "Done",
  dropped: "Dropped",
  reviewed: "Reviewed",
  not_applicable: "",
};

export interface CommitmentProgress {
  total: number;
  done: number;
  dropped: number;
  open: number;
  overdue: number;
  /** Always the same caveat: actions are not the outcome. */
  caveat: string;
}

export const ACTIONS_ARE_NOT_OUTCOMES = "This tracks what you did, not how the decision turned out.";

export function commitmentProgress(commitments: readonly DecisionCommitment[], today: string): CommitmentProgress {
  const states = commitments.map((c) => commitmentState(c, today));
  return {
    total: commitments.length,
    done: states.filter((s) => s === "done").length,
    dropped: states.filter((s) => s === "dropped").length,
    open: states.filter((s) => s !== "done" && s !== "dropped").length,
    overdue: states.filter((s) => s === "overdue").length,
    caveat: ACTIONS_ARE_NOT_OUTCOMES,
  };
}

// ---------------------------------------------------------------------------
// Editing (each returns a new decision; saving goes through the audited builder)
// ---------------------------------------------------------------------------

export type CommitmentIssue = "text_required" | "text_too_long" | "owner_too_long" | "invalid_date" | "too_many";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(text: string): boolean {
  if (!YMD.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

export function validateCommitmentDraft(draft: { text: string; owner?: string; targetDate?: string }, existingCount: number): CommitmentIssue[] {
  const out: CommitmentIssue[] = [];
  if (!draft.text.trim()) out.push("text_required");
  if (draft.text.trim().length > DECISION_LIMITS.text) out.push("text_too_long");
  if ((draft.owner ?? "").trim().length > 60) out.push("owner_too_long");
  if (draft.targetDate && !isValidDate(draft.targetDate)) out.push("invalid_date");
  if (existingCount >= DECISION_LIMITS.commitments) out.push("too_many");
  return out;
}

export function addCommitment(d: MoneyDecision, draft: { id: string; text: string; owner?: string; targetDate?: string }): MoneyDecision {
  const c: DecisionCommitment = { id: draft.id, text: draft.text.trim(), status: "open" };
  if (draft.owner?.trim()) c.owner = draft.owner.trim();
  if (draft.targetDate) c.targetDate = draft.targetDate;
  return { ...d, commitments: [...d.commitments, c] };
}

export function setCommitmentStatus(d: MoneyDecision, id: string, status: DecisionCommitment["status"], nowMs: number): MoneyDecision {
  return {
    ...d,
    commitments: d.commitments.map((c) => {
      if (c.id !== id) return c;
      const next: DecisionCommitment = { ...c, status };
      if (status === "done") next.completedAtMs = nowMs;
      else delete next.completedAtMs;
      return next;
    }),
  };
}

export function removeCommitment(d: MoneyDecision, id: string): MoneyDecision {
  return { ...d, commitments: d.commitments.filter((c) => c.id !== id) };
}

export function setReviewDate(d: MoneyDecision, date: string | null): MoneyDecision {
  const next = { ...d };
  if (date) next.reviewDate = date;
  else delete next.reviewDate;
  return next;
}

// ---------------------------------------------------------------------------
// Follow-up across decisions
// ---------------------------------------------------------------------------

export interface FollowUp {
  key: string;
  decisionId: string;
  decisionTitle: string;
  kind: "review" | "commitment";
  text: string;
  date?: string;
  state: DueState;
}

/** Open reviews and actions that need attention, most urgent first. Archived decisions are skipped. */
export function followUps(decisions: readonly MoneyDecision[], today: string, include: DueState[] = ["overdue", "due_today", "upcoming"]): FollowUp[] {
  const out: FollowUp[] = [];
  for (const d of decisions) {
    if (d.status === "archived") continue;
    const rs = reviewState(d, today);
    if (rs !== "reviewed" && rs !== "not_applicable" && include.includes(rs)) {
      out.push({ key: `${d.id}:review`, decisionId: d.id, decisionTitle: d.title, kind: "review", text: "Review this decision", date: d.reviewDate, state: rs });
    }
    for (const c of d.commitments) {
      const cs = commitmentState(c, today);
      if (cs === "done" || cs === "dropped" || !include.includes(cs)) continue;
      out.push({ key: `${d.id}:${c.id}`, decisionId: d.id, decisionTitle: d.title, kind: "commitment", text: c.text, date: c.targetDate, state: cs });
    }
  }
  const rank: Record<DueState, number> = { overdue: 0, due_today: 1, upcoming: 2, later: 3, no_date: 4 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.key.localeCompare(b.key));
}

/**
 * Neutral dated events for the Financial Calendar (SPENDLY-176) to consume
 * once it exists. Only items with a real date; nothing is invented.
 */
export interface DecisionCalendarEvent {
  id: string;
  date: string;
  kind: "decision_review" | "decision_commitment";
  title: string;
  decisionId: string;
  href: string;
}

export function decisionCalendarEvents(decisions: readonly MoneyDecision[]): DecisionCalendarEvent[] {
  const out: DecisionCalendarEvent[] = [];
  for (const d of decisions) {
    if (d.status === "archived" || d.status === "draft") continue;
    const href = `/decisions/${d.id}`;
    if (d.reviewDate && (d.status === "decided" || d.status === "tracking")) {
      out.push({ id: `decision:${d.id}:review`, date: d.reviewDate, kind: "decision_review", title: `Review: ${d.title}`, decisionId: d.id, href });
    }
    for (const c of d.commitments) {
      if (c.status !== "open" || !c.targetDate) continue;
      out.push({ id: `decision:${d.id}:${c.id}`, date: c.targetDate, kind: "decision_commitment", title: c.text, decisionId: d.id, href });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
