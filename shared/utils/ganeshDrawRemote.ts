/**
 * HTTP contract for the Netlify Token Laddu draw function (KAN-125).
 *
 * The draw is the one operation in this feature that a client must not be able
 * to perform. A winner is announced in front of a crowd and can never be
 * quietly re-rolled, so both halves of the guarantee live on the server: the
 * random choice, and the write. Firestore rules deny every client write to
 * `tokenDrawResults`; the Admin SDK inside the function bypasses them.
 *
 * Cloud Functions need Blaze, and this project is on Spark — `functions/src`
 * says so. So the trusted writer lives on Netlify, exactly like the festival
 * summary it is modelled on.
 */

export type DrawRemoteMode = "draw";

/** Why a draw request did not produce a winner. Distinguishable client-side. */
export type DrawRefusal =
  /** Every configured draw has already run. */
  | "complete"
  /** No eligible token left in the pot. */
  | "exhausted"
  /** The session is closed or cancelled. */
  | "closed";

export type DrawResponse = {
  /** Present when a winner was committed. */
  winner?: {
    tokenId: string;
    tokenNumber: number;
    participantName: string;
    mobile?: string;
    receiptNumberPhysical: string;
    sequence: number;
    registrationId: string;
  };
  /** Present instead of `winner` when the draw legitimately produced none. */
  refusal?: DrawRefusal;
  completedDraws: number;
  plannedDraws: number;
  eligibleCount: number;
};

export function ganeshDrawFunctionUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return base ? `${base}/.netlify/functions/ganesh-draw` : "";
}

/**
 * Who may run a draw, decided server-side from the member document.
 *
 * Mirrors `canRunDrawOf()` in firestore.rules, and like it has **no legacy role
 * fallback** — `draw.run` did not exist when the old member documents were
 * written, so a member without a `permissions` array cannot have been granted
 * it. An admin still short-circuits, as everywhere else.
 */
export function canRunTokenDraw(
  member: { status?: unknown; role?: unknown; permissions?: unknown } | null | undefined
): boolean {
  if (!member || member.status !== "active") return false;
  if (member.role === "admin") return true;
  return Array.isArray(member.permissions) && member.permissions.includes("draw.run");
}

/**
 * Decides the outcome of one draw request from the state read in the
 * transaction.
 *
 * Pure so the rules that matter — stop when the draws are done, stop when the
 * pot is empty, never invent a winner to fill a shortfall — are testable
 * without a server or an emulator.
 */
export function resolveDrawOutcome(input: {
  sessionStatus: string;
  plannedDraws: number;
  completedDraws: number;
  eligibleCount: number;
}): { canDraw: boolean; refusal?: DrawRefusal; sequence: number } {
  const plannedDraws = Math.max(0, Math.trunc(input.plannedDraws));
  const completedDraws = Math.max(0, Math.trunc(input.completedDraws));
  const sequence = completedDraws + 1;

  if (input.sessionStatus !== "open") return { canDraw: false, refusal: "closed", sequence };
  if (completedDraws >= plannedDraws) return { canDraw: false, refusal: "complete", sequence };
  // Fewer tokens than draws left is not an error — it is the shortfall KAN-125
  // asks us to stop on rather than fill by drawing someone twice.
  if (input.eligibleCount <= 0) return { canDraw: false, refusal: "exhausted", sequence };

  return { canDraw: true, sequence };
}

/** The message a refusal should show. Kept next to the reason it describes. */
export function drawRefusalMessage(refusal: DrawRefusal): string {
  if (refusal === "complete") return "Every draw is done.";
  if (refusal === "exhausted") {
    return "No Token Laddus are left in the draw. The remaining draws cannot be filled.";
  }
  return "This draw session is closed.";
}
