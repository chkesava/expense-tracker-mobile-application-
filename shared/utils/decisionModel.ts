/**
 * SPENDLY-362 — pure rules for Money Decisions (shared/types/decision.ts).
 *
 * No Firebase or React imports. Every write goes through `buildDecisionWrite`
 * so the lifecycle, the frozen snapshot, provenance and the size caps are
 * enforced in one place (and mirrored by firestore.rules).
 */

import {
  DECISION_CATEGORIES,
  DECISION_LIMITS,
  DECISION_STATUSES,
  type DecisionCategory,
  type DecisionEvent,
  type DecisionSnapshot,
  type DecisionStatus,
  type MoneyDecision,
} from "../types/decision";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Forward moves plus the explicit reopen paths. `archived` handled separately. */
const TRANSITIONS: Readonly<Record<Exclude<DecisionStatus, "archived">, readonly DecisionStatus[]>> = {
  draft: ["considering", "decided"],
  considering: ["draft", "decided"],
  decided: ["tracking", "reviewed"],
  tracking: ["reviewed"],
  reviewed: ["closed", "tracking"],
  closed: ["reviewed"],
};

export function isDecisionStatus(value: unknown): value is DecisionStatus {
  return typeof value === "string" && (DECISION_STATUSES as readonly string[]).includes(value);
}

export function isDecisionCategory(value: unknown): value is DecisionCategory {
  return typeof value === "string" && (DECISION_CATEGORIES as readonly string[]).includes(value);
}

export function canTransitionDecision(decision: Pick<MoneyDecision, "status" | "archivedFromStatus">, to: DecisionStatus): boolean {
  if (decision.status === to) return false;
  if (to === "archived") return true;
  if (decision.status === "archived") return to === (decision.archivedFromStatus ?? "draft");
  return TRANSITIONS[decision.status].includes(to);
}

/** Past "the decision was made": the reasoning snapshot must exist from here on. */
export function isDecidedOrLater(status: DecisionStatus): boolean {
  return status === "decided" || status === "tracking" || status === "reviewed" || status === "closed";
}

/** JSON deep copy: the data is plain JSON, and Hermes may lack structuredClone. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function freezeDecisionSnapshot(decision: MoneyDecision, nowMs: number): DecisionSnapshot {
  const snapshot: DecisionSnapshot = {
    frozenAtMs: nowMs,
    revision: decision.revision,
    alternatives: copy(decision.alternatives),
    assumptions: copy(decision.assumptions),
    links: copy(decision.links),
  };
  if (decision.selectedAlternativeId) snapshot.selectedAlternativeId = decision.selectedAlternativeId;
  if (decision.expected) snapshot.expected = copy(decision.expected);
  if (decision.rationale) snapshot.rationale = decision.rationale;
  return snapshot;
}

export type TransitionResult =
  | { ok: true; decision: MoneyDecision }
  | { ok: false; issues: DecisionIssue[] };

/**
 * Move a decision to another status. The first move into "decided" (or
 * later) freezes the reasoning snapshot; it is never re-frozen afterwards,
 * so reopening and editing cannot rewrite what the user believed then.
 */
export function transitionDecision(decision: MoneyDecision, to: DecisionStatus, nowMs: number): TransitionResult {
  if (!canTransitionDecision(decision, to)) return { ok: false, issues: ["invalid_transition"] };
  const next: MoneyDecision = { ...decision, status: to };
  if (to === "archived") {
    next.archivedFromStatus = decision.status;
  } else if (decision.status === "archived") {
    delete next.archivedFromStatus;
  }
  if (isDecidedOrLater(to)) {
    const issues = validateDecision(next).filter((i) => i === "selection_missing" || i === "selection_unknown");
    if (issues.length > 0) return { ok: false, issues };
    if (!next.decisionSnapshot) next.decisionSnapshot = freezeDecisionSnapshot(next, nowMs);
    if (!next.decidedAtMs) next.decidedAtMs = nowMs;
  }
  if (to === "closed") next.closedAtMs = nowMs;
  if (decision.status === "closed" && to !== "archived") delete next.closedAtMs;
  return { ok: true, decision: next };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type DecisionIssue =
  | "title_required"
  | "title_too_long"
  | "unknown_category"
  | "unknown_status"
  | "text_too_long"
  | "too_many_items"
  | "duplicate_id"
  | "selection_missing"
  | "selection_unknown"
  | "invalid_amount"
  | "assumption_source_missing"
  | "link_ref_missing"
  | "invalid_confidence"
  | "invalid_date"
  | "snapshot_missing"
  | "invalid_transition";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function tooLong(value: string | undefined, max: number): boolean {
  return typeof value === "string" && value.length > max;
}

function hasDuplicateIds(items: ReadonlyArray<{ id: string }>): boolean {
  return new Set(items.map((i) => i.id)).size !== items.length;
}

/**
 * Structural and provenance checks. Drafts need only a title and category;
 * a decided decision must name the option it chose (when options exist).
 */
export function validateDecision(d: MoneyDecision): DecisionIssue[] {
  const issues = new Set<DecisionIssue>();
  const L = DECISION_LIMITS;

  if (!d.title.trim()) issues.add("title_required");
  if (d.title.length > L.title) issues.add("title_too_long");
  if (!isDecisionCategory(d.category)) issues.add("unknown_category");
  if (!isDecisionStatus(d.status)) issues.add("unknown_status");

  const texts = [d.rationale, d.context.situation, d.context.goal, d.expected?.summary, d.outcome?.summary, d.outcome?.lessons];
  if (texts.some((t) => tooLong(t, L.text))) issues.add("text_too_long");

  if (
    d.alternatives.length > L.alternatives ||
    d.assumptions.length > L.assumptions ||
    d.links.length > L.links ||
    d.commitments.length > L.commitments ||
    d.context.constraints.length > L.listItems ||
    d.alternatives.some((a) => a.pros.length > L.listItems || a.cons.length > L.listItems || a.inputs.length > L.listItems)
  ) {
    issues.add("too_many_items");
  }
  if (
    d.alternatives.some((a) => !a.title.trim() || tooLong(a.title, L.label) || tooLong(a.notes, L.text) || tooLong(a.nonFinancial, L.text)) ||
    d.assumptions.some((a) => tooLong(a.text, L.text)) ||
    d.commitments.some((c) => tooLong(c.text, L.text)) ||
    d.links.some((l) => tooLong(l.capturedLabel, L.label))
  ) {
    issues.add("text_too_long");
  }

  if ([d.alternatives, d.assumptions, d.links, d.commitments].some(hasDuplicateIds)) issues.add("duplicate_id");

  const amounts = [
    ...d.alternatives.flatMap((a) => a.inputs.map((i) => i.amount)),
    ...d.assumptions.flatMap((a) => (a.value === undefined ? [] : [a.value])),
    ...(d.expected?.amount === undefined ? [] : [d.expected.amount]),
    ...(d.outcome?.amount === undefined ? [] : [d.outcome.amount]),
  ];
  if (amounts.some((v) => !Number.isFinite(v) || Math.abs(v) >= 1e12)) issues.add("invalid_amount");
  if (d.alternatives.some((a) => a.inputs.some((i) => i.amount < 0))) issues.add("invalid_amount");

  const linkIds = new Set(d.links.map((l) => l.id));
  for (const a of d.assumptions) {
    if (a.source === "linked" && (!a.sourceLinkId || !linkIds.has(a.sourceLinkId))) issues.add("assumption_source_missing");
    if (a.source === "derived" && !a.derivation?.trim()) issues.add("assumption_source_missing");
  }
  if (d.links.some((l) => !l.refId.trim() || (l.kind === "transaction" && !l.refKind))) issues.add("link_ref_missing");

  if (d.confidence !== undefined && (!Number.isInteger(d.confidence) || d.confidence < 1 || d.confidence > 5)) {
    issues.add("invalid_confidence");
  }
  const dates = [d.reviewDate, d.expected?.byDate, d.outcome?.outcomeDate, ...d.commitments.map((c) => c.targetDate)];
  if (dates.some((x) => x !== undefined && !YMD.test(x))) issues.add("invalid_date");

  if (d.selectedAlternativeId && !d.alternatives.some((a) => a.id === d.selectedAlternativeId)) issues.add("selection_unknown");
  const live = d.status === "archived" ? d.archivedFromStatus ?? "draft" : d.status;
  if (isDecidedOrLater(live)) {
    if (d.alternatives.length > 0 && !d.selectedAlternativeId) issues.add("selection_missing");
    if (!d.decisionSnapshot) issues.add("snapshot_missing");
  }
  return [...issues];
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function newDecisionDraft(args: {
  id: string;
  title: string;
  category: DecisionCategory;
  nowMs: number;
  templateId?: string;
  templateVersion?: number;
}): MoneyDecision {
  const d: MoneyDecision = {
    id: args.id,
    title: args.title.trim(),
    category: args.category,
    status: "draft",
    context: { constraints: [] },
    alternatives: [],
    assumptions: [],
    links: [],
    commitments: [],
    revision: 0,
    createdAtMs: args.nowMs,
    updatedAtMs: args.nowMs,
  };
  if (args.templateId) d.templateId = args.templateId;
  if (args.templateVersion !== undefined) d.templateVersion = args.templateVersion;
  return d;
}

/** Drop undefined recursively so Firestore never receives `undefined`. */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export type DecisionWrite =
  | { ok: true; data: Omit<MoneyDecision, "id">; event: Omit<DecisionEvent, "id"> }
  | { ok: false; issues: DecisionIssue[] };

/**
 * The only way a decision document should be produced. Advances the
 * revision, pins creation time and the frozen snapshot, and emits the audit
 * event (field names only — never content).
 */
export function buildDecisionWrite(previous: MoneyDecision | null, next: MoneyDecision, nowMs: number): DecisionWrite {
  const candidate: MoneyDecision = {
    ...next,
    title: next.title.trim(),
    revision: (previous?.revision ?? 0) + 1,
    createdAtMs: previous?.createdAtMs ?? next.createdAtMs,
    updatedAtMs: nowMs,
  };
  // History is immutable: once frozen, the snapshot is whatever it was.
  if (previous?.decisionSnapshot) candidate.decisionSnapshot = previous.decisionSnapshot;
  if (previous?.decidedAtMs) candidate.decidedAtMs = previous.decidedAtMs;

  const issues = validateDecision(candidate);
  if (issues.length > 0) return { ok: false, issues };

  const { id, ...rest } = candidate;
  const data = clean(rest);
  const changedFields = previous
    ? Object.keys({ ...previous, ...candidate })
        .filter((k) => !["id", "revision", "updatedAtMs"].includes(k))
        .filter((k) => stable((previous as unknown as Record<string, unknown>)[k]) !== stable((candidate as unknown as Record<string, unknown>)[k]))
        .sort()
        .slice(0, DECISION_LIMITS.changedFields)
    : [];
  const statusChanged = previous && previous.status !== candidate.status;
  const event: Omit<DecisionEvent, "id"> = clean({
    decisionId: id,
    action: previous ? (statusChanged ? "status" : "update") : "create",
    fromStatus: statusChanged ? previous!.status : undefined,
    toStatus: statusChanged || !previous ? candidate.status : undefined,
    changedFields,
    revision: candidate.revision,
    atMs: nowMs,
  });
  return { ok: true, data, event };
}

export function deletionEvent(decision: Pick<MoneyDecision, "id" | "revision" | "status">, nowMs: number): Omit<DecisionEvent, "id"> {
  return { decisionId: decision.id, action: "delete", fromStatus: decision.status, changedFields: [], revision: decision.revision + 1, atMs: nowMs };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<DecisionStatus, string> = {
  draft: "Draft",
  considering: "Considering",
  decided: "Decided",
  tracking: "Tracking",
  reviewed: "Reviewed",
  closed: "Closed",
  archived: "Archived",
};

const CATEGORY_LABELS: Record<DecisionCategory, string> = {
  purchase: "Purchase",
  loan_debt: "Loan or debt",
  savings: "Savings",
  investment: "Investment",
  insurance: "Insurance",
  subscription: "Subscription",
  income: "Salary or income",
  major_recurring: "Major recurring expense",
  goal: "Financial goal",
  other: "Other",
};

export function decisionStatusLabel(status: DecisionStatus): string {
  return STATUS_LABELS[status];
}

export function decisionCategoryLabel(category: DecisionCategory): string {
  return CATEGORY_LABELS[category];
}

/** Drafts first, then open decisions, then closed, then archived; newest touched first. */
export function sortDecisionsForList(decisions: readonly MoneyDecision[]): MoneyDecision[] {
  const rank = (d: MoneyDecision) => (d.status === "draft" ? 0 : d.status === "archived" ? 3 : d.status === "closed" ? 2 : 1);
  return [...decisions].sort((a, b) => rank(a) - rank(b) || b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id));
}
