/**
 * SPENDLY-613 — what a failed goal write means, in words (FRD FR-13).
 *
 * The conflict policy (IMPLEMENTATION_PLAN §2.4) decides what the server can
 * refuse:
 *   - contributions, reductions and corrections merge (increment()), so two
 *     devices never lose each other's deltas; one is refused only if it would
 *     take the saved amount below zero or the goal was closed meanwhile;
 *   - target, name, lifecycle and milestone edits carry a literal expected
 *     version, so a stale edit is refused instead of overwriting the other
 *     device's change (surfaced as a conflict, never silent);
 *   - ordering, pinning, reminders and the lock are last-writer-wins.
 *
 * Rules can't say *why* they refused, so the message is chosen from the kind
 * of write that failed, and says what the user can do.
 */

import type { VersionMode } from "./goalWrites";

export type GoalFailureKind = "conflict" | "refused" | "unavailable" | "other";

const REFUSED_CODES = new Set(["permission-denied", "failed-precondition", "already-exists", "aborted"]);
const UNAVAILABLE_CODES = new Set(["unavailable", "deadline-exceeded", "resource-exhausted"]);

export function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== "string") return undefined;
  return code.startsWith("firestore/") ? code.slice("firestore/".length) : code;
}

export function classifyGoalWriteFailure(code: string | undefined, plan: { version: VersionMode; amountDelta: number }): GoalFailureKind {
  if (!code) return "other";
  if (UNAVAILABLE_CODES.has(code)) return "unavailable";
  if (REFUSED_CODES.has(code)) return plan.version.kind === "expect" ? "conflict" : "refused";
  return "other";
}

export function goalFailureMessage(kind: GoalFailureKind, plan: { amountDelta: number }): string {
  switch (kind) {
    case "conflict":
      return "This goal was changed on another device, so your change wasn't saved. Retry applies it to the latest version.";
    case "refused":
      return plan.amountDelta < 0
        ? "This wasn't saved: it would take the saved amount below zero, or the goal was closed on another device."
        : "This wasn't saved: the goal may have been completed, archived or cancelled on another device.";
    case "unavailable":
      return "Couldn't reach the server, so this wasn't saved. Retry when you're back online.";
    case "other":
      return "This change couldn't be saved.";
  }
}
