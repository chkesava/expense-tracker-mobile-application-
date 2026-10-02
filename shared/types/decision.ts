/**
 * SPENDLY-362 — Money Decisions (epic SPENDLY-361, "Financial Decision
 * Journal"). Named `decision*` / `MoneyDecision` in code so it can never be
 * confused with the ledger's Journal (SPENDLY-102).
 *
 * A decision is a record of *reasoning*, not money. It never holds an
 * authoritative amount or balance: linked Spendly records are references,
 * and any figure copied from them at the time (`captured*`) is display-only
 * history that no total may sum.
 *
 * The categories of content are kept apart on purpose:
 *   - facts           → `links` (references to canonical records)
 *   - assumptions     → `assumptions` (user, linked or derived, with provenance)
 *   - user inputs     → `alternatives[].inputs` (numbers the user typed)
 *   - rationale       → `rationale`, `context`, alternative notes / pros / cons
 *   - expected        → `expected`
 *   - actual          → `outcome` (only ever what the user recorded)
 *
 * `decisionSnapshot` freezes the reasoning when the decision is first made;
 * later edits to the live fields never rewrite it (enforced by rules too).
 */

/** Persisted ids — append only, never rename. */
export const DECISION_CATEGORIES = [
  "purchase",
  "loan_debt",
  "savings",
  "investment",
  "insurance",
  "subscription",
  "income",
  "major_recurring",
  "goal",
  "other",
] as const;
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

/**
 * Lifecycle: draft → considering → decided → tracking → reviewed → closed.
 * `archived` can be reached from anywhere and restores to where it was.
 */
export const DECISION_STATUSES = [
  "draft",
  "considering",
  "decided",
  "tracking",
  "reviewed",
  "closed",
  "archived",
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const DECISION_UNITS = ["inr", "percent", "months", "years", "count"] as const;
export type DecisionUnit = (typeof DECISION_UNITS)[number];

/** Size caps shared by the builder and firestore.rules (contract-tested). */
export const DECISION_LIMITS = {
  title: 140,
  text: 2000,
  label: 120,
  alternatives: 20,
  assumptions: 30,
  links: 30,
  commitments: 30,
  listItems: 20,
  changedFields: 40,
} as const;

/** A number the user typed for an alternative. Always a user input. */
export interface DecisionInput {
  id: string;
  label: string;
  amount: number;
  direction: "cost" | "benefit";
  frequency: "one_time" | "monthly" | "yearly";
  kind: "user_input";
}

export interface DecisionAlternative {
  id: string;
  title: string;
  notes?: string;
  pros: string[];
  cons: string[];
  inputs: DecisionInput[];
  /** Things that matter but aren't money. */
  nonFinancial?: string;
}

/**
 * An assumption with its provenance:
 *   - `user`    typed by the user
 *   - `linked`  read from a linked record (`sourceLinkId`) at capture time
 *   - `derived` calculated (`derivation` says how)
 */
export interface DecisionAssumption {
  id: string;
  text: string;
  value?: number;
  unit?: DecisionUnit;
  source: "user" | "linked" | "derived";
  sourceLinkId?: string;
  derivation?: string;
}

export interface DecisionExpected {
  summary: string;
  amount?: number;
  unit?: DecisionUnit;
  byDate?: string;
}

/** What actually happened — only ever user-recorded (SPENDLY-369). */
export interface DecisionOutcome {
  recordedAtMs: number;
  summary: string;
  amount?: number;
  unit?: DecisionUnit;
  outcomeDate?: string;
  /** The user's own verdict. Spendly never infers one. */
  userAssessment?: "better" | "as_expected" | "worse" | "mixed" | "unsure";
  lessons?: string;
}

export const DECISION_LINK_KINDS = [
  "transaction",
  "account",
  "borrowing",
  "receivable",
  "goal",
  "subscription",
] as const;
export type DecisionLinkKind = (typeof DECISION_LINK_KINDS)[number];

/** A reference to a canonical Spendly record. Never a source of truth. */
export interface DecisionLink {
  id: string;
  kind: DecisionLinkKind;
  refId: string;
  /** For `transaction`: which ledger collection (TransactionKind). */
  refKind?: string;
  /** What it looked like when linked — history, never summed. */
  capturedLabel: string;
  capturedAmount?: number;
  capturedAtMs: number;
}

/**
 * An action the user committed to (SPENDLY-367). Distinct from transactions:
 * it records what someone meant to do, never money. Completing one says the
 * action happened — not that the decision worked out.
 */
export interface DecisionCommitment {
  id: string;
  text: string;
  /** Who does it, when that isn't just the user (e.g. "Spouse"). */
  owner?: string;
  targetDate?: string;
  status: "open" | "done" | "dropped";
  completedAtMs?: number;
}

export interface DecisionContext {
  situation?: string;
  goal?: string;
  constraints: string[];
}

/** Reasoning frozen at the moment of deciding. */
export interface DecisionSnapshot {
  frozenAtMs: number;
  revision: number;
  alternatives: DecisionAlternative[];
  selectedAlternativeId?: string;
  assumptions: DecisionAssumption[];
  expected?: DecisionExpected;
  links: DecisionLink[];
  rationale?: string;
}

export interface MoneyDecision {
  id: string;
  title: string;
  category: DecisionCategory;
  status: DecisionStatus;
  archivedFromStatus?: DecisionStatus;
  templateId?: string;
  templateVersion?: number;
  context: DecisionContext;
  alternatives: DecisionAlternative[];
  selectedAlternativeId?: string;
  assumptions: DecisionAssumption[];
  rationale?: string;
  /** User's own confidence, 1–5. */
  confidence?: number;
  expected?: DecisionExpected;
  outcome?: DecisionOutcome;
  links: DecisionLink[];
  commitments: DecisionCommitment[];
  reviewDate?: string;
  decisionSnapshot?: DecisionSnapshot;
  revision: number;
  createdAtMs: number;
  updatedAtMs: number;
  decidedAtMs?: number;
  closedAtMs?: number;
}

export const DECISION_EVENT_ACTIONS = ["create", "update", "status", "delete"] as const;
export type DecisionEventAction = (typeof DECISION_EVENT_ACTIONS)[number];

/** Append-only audit row in `users/{uid}/decisionEvents`. Field names only. */
export interface DecisionEvent {
  id: string;
  decisionId: string;
  action: DecisionEventAction;
  fromStatus?: DecisionStatus;
  toStatus?: DecisionStatus;
  changedFields: string[];
  revision: number;
  atMs: number;
}
