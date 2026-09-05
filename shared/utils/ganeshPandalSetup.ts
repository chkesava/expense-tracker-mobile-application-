/**
 * Detecting a half-created Pandal (GS-071).
 *
 * Pandal creation is one atomic batch followed by several separate steps: the
 * festival document and its year claim, then the seed batch that writes the
 * creator's festival-member row, the summary and the default categories, then
 * the Permanent Fund and its optional allocation. Firestore cannot roll back
 * across those boundaries, so a failure or an app kill part-way leaves a real
 * Pandal in an incomplete state.
 *
 * `commitWrite` widens the window: it reports a write as `"queued"` after about
 * 1.5s without a server acknowledgement, so a later step can start while an
 * earlier one's rejection is still in flight.
 *
 * The first batch is genuinely atomic — Pandal document, invite, membership
 * index and the creator's admin member row commit together — so
 * creator-becomes-admin never half-happens. Everything after it can.
 *
 * This module is the pure half: given what was found in Firestore, decide what
 * is missing and whether the app can put it right on its own. Kept free of
 * Firestore so the decision can be tested directly.
 */

/** A specific thing first-festival seeding should have produced and did not. */
export type PandalSetupGap =
  /** The Pandal has no festival at all. */
  | "no-festival"
  /** The festival exists but its summary document was never written. */
  | "missing-summary"
  /** The festival exists but no expense categories were seeded. */
  | "missing-categories"
  /** The festival exists but the creator has no festival-member row. */
  | "missing-member";

export type PandalSetupDiagnosis = {
  complete: boolean;
  /** The festival the gaps belong to, when there is one. */
  festivalId: string | null;
  gaps: PandalSetupGap[];
  /**
   * Whether `repairPandalSetup` can finish the job without inventing anything.
   *
   * False for `no-festival`: the festival's name and year were the user's
   * choice and are not recoverable from what survived, so the app must send
   * them to the create-festival screen rather than guess. Everything else is
   * deterministic — the summary starts empty, the categories are the shipped
   * defaults, and the member row is the creator as admin.
   */
  repairable: boolean;
};

export function diagnosePandalSetup(found: {
  /** Festivals on the Pandal, in any order. */
  festivals: Array<{ id: string; status?: string }>;
  /** Whether the newest festival's summary document exists. */
  summaryExists: boolean;
  /** How many category documents the newest festival has. */
  categoryCount: number;
  /** Whether the creator has a member row on the newest festival. */
  memberExists: boolean;
}): PandalSetupDiagnosis {
  if (found.festivals.length === 0) {
    return {
      complete: false,
      festivalId: null,
      gaps: ["no-festival"],
      repairable: false,
    };
  }

  // An open festival is the one a half-finished setup would have left behind;
  // fall back to the first so a Pandal whose only festival was closed is not
  // reported as broken.
  const target =
    found.festivals.find((festival) => festival.status === "open") ?? found.festivals[0];

  const gaps: PandalSetupGap[] = [];
  if (!found.summaryExists) gaps.push("missing-summary");
  if (found.categoryCount === 0) gaps.push("missing-categories");
  if (!found.memberExists) gaps.push("missing-member");

  return {
    complete: gaps.length === 0,
    festivalId: target.id,
    gaps,
    repairable: gaps.length > 0,
  };
}

/**
 * What to tell the committee. Deliberately concrete about the consequence
 * rather than saying "setup incomplete", because the symptom they are actually
 * looking at — no categories on the expense form, totals reading zero — does
 * not obviously point back at Pandal creation.
 */
export function describePandalSetupGaps(gaps: PandalSetupGap[]): string {
  if (gaps.includes("no-festival")) {
    return "This Pandal has no festival yet, so there is nowhere to record money. Create one to finish setting up.";
  }
  const parts: string[] = [];
  if (gaps.includes("missing-summary")) parts.push("its totals were never started");
  if (gaps.includes("missing-categories")) parts.push("it has no expense categories");
  if (gaps.includes("missing-member")) parts.push("you were not added to it");
  if (parts.length === 0) return "";
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Setting up this festival did not finish — ${joined}.`;
}
