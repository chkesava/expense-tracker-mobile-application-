import { money } from "@/shared/utils/ganeshMath";
import type { TokenLadduConfig, TokenLadduToken } from "@/shared/types/ganeshTokenLaddu";

/**
 * Token Laddu rules that need no Firestore (KAN-125).
 *
 * Everything here is pure so the integrity questions — how many tokens a
 * purchase creates, whether it fits in the pot, which codes it gets, whether a
 * draw can still run — are testable without an emulator. The service module
 * enforces the same rules inside a transaction; this is where they are
 * *defined*.
 */

/**
 * Most laddus a single receipt may buy.
 *
 * Partly a sanity check on a mistyped quantity, partly a hard constraint: the
 * registration writes one document per token inside one transaction, and
 * Firestore caps a transaction at 500 writes. 50 tokens plus the registration,
 * the collection row, the config bump and two log entries leaves ample room.
 */
export const MAX_TOKENS_PER_REGISTRATION = 50;

/** Ceiling on configured capacity. Mirrors the bound in firestore.rules. */
export const MAX_TOKEN_CAPACITY = 1_000_000;

export const TOKEN_LADDU_OFFLINE_ERROR =
  "Register a Token Laddu when you are online, so each token gets a unique number and the count stays correct.";

export const TOKEN_DRAW_OFFLINE_ERROR =
  "Run the draw when you are online. A winner has to be recorded once, on the server.";

/**
 * A token's human-readable code, e.g. `TKN26-000042`.
 *
 * Year-prefixed and zero-padded like `formatCollectionReceipt`, for the same
 * reason: it sorts correctly as a string, and it is short enough to read out
 * over a loudspeaker without ambiguity. This value is also the token's Firestore
 * document id, which is what makes the code unique — see `TokenLadduToken`.
 */
export function formatTokenCode(year: number, sequence: number): string {
  const yy = String(Math.abs(Math.trunc(year)) % 100).padStart(2, "0");
  const n = Math.max(1, Math.trunc(sequence));
  return `TKN${yy}-${String(n).padStart(6, "0")}`;
}

/** The sequence numbers a registration of `quantity` gets, given the allocator. */
export function allocateTokenNumbers(nextTokenNumber: number, quantity: number): number[] {
  const start = Math.max(0, Math.trunc(nextTokenNumber));
  return Array.from({ length: quantity }, (_, index) => start + index + 1);
}

export type TokenCapacity = {
  /** Configured number of physical laddus. */
  total: number;
  /** Tokens created so far, cancelled ones included. */
  registered: number;
  /** Tokens that can still be registered. Never negative. */
  remaining: number;
  /** Tokens still in the pot. */
  eligible: number;
  cancelled: number;
  full: boolean;
};

export function readTokenCapacity(config: Partial<TokenLadduConfig> | null | undefined): TokenCapacity {
  const total = Math.max(0, Math.trunc(Number(config?.totalTokens ?? 0)));
  const registered = Math.max(0, Math.trunc(Number(config?.registeredCount ?? 0)));
  const cancelled = Math.max(0, Math.trunc(Number(config?.cancelledCount ?? 0)));
  return {
    total,
    registered,
    cancelled,
    remaining: Math.max(0, total - registered),
    eligible: Math.max(0, registered - cancelled),
    full: registered >= total,
  };
}

/**
 * Validates a registration against the configuration.
 *
 * Throws with copy a committee member can act on, in the house style — these
 * messages reach the user directly through `friendlyErrorMessage`, which passes
 * an already-friendly message straight through.
 */
export function validateTokenRegistration(input: {
  quantity: number;
  amount: number;
  participantName: string;
  receiptNumberPhysical: string;
  config: Partial<TokenLadduConfig> | null | undefined;
}): void {
  if (!input.participantName.trim()) {
    throw new Error("Enter the participant's name.");
  }
  if (!input.receiptNumberPhysical.trim()) {
    throw new Error("Enter the receipt number from the Token Laddu book.");
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("Number of Token Laddus must be a whole number above zero.");
  }
  if (input.quantity > MAX_TOKENS_PER_REGISTRATION) {
    throw new Error(
      `One receipt can register up to ${MAX_TOKENS_PER_REGISTRATION} Token Laddus. Split a larger purchase across receipts.`
    );
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("Enter the amount collected.");
  }

  const capacity = readTokenCapacity(input.config);
  if (capacity.total <= 0) {
    throw new Error("Set the number of Token Laddus for this festival before registering any.");
  }
  if (input.quantity > capacity.remaining) {
    // The ticket's scenario 5: past capacity is blocked until someone with
    // `tokens.config` raises the number, which is audited.
    throw new Error(
      capacity.remaining === 0
        ? `All ${capacity.total} Token Laddus are registered. Raise the number of Token Laddus to register more.`
        : `Only ${capacity.remaining} Token ${capacity.remaining === 1 ? "Laddu is" : "Laddus are"} left. Raise the number of Token Laddus to register more.`
    );
  }
}

/**
 * Splits a purchase across its tokens so the per-token figures add back up to
 * the amount actually collected.
 *
 * A plain division leaves a remainder — ₹100 across 3 tokens is 33.33 three
 * times, which is ₹99.99 — so the paise left over go on the first token rather
 * than quietly disappearing from the PDF's column total.
 */
export function splitAmountAcrossTokens(amount: number, quantity: number): number[] {
  if (quantity <= 0) return [];
  const each = money(amount / quantity);
  const shares = Array.from({ length: quantity }, () => each);
  const drift = money(amount - money(each * quantity));
  if (drift !== 0) shares[0] = money(shares[0] + drift);
  return shares;
}

/** Validates a capacity change. Reducing below what exists is refused. */
export function validateTokenCapacityChange(input: {
  totalTokens: number;
  config: Partial<TokenLadduConfig> | null | undefined;
  reason?: string;
}): void {
  if (!Number.isInteger(input.totalTokens) || input.totalTokens < 0) {
    throw new Error("Number of Token Laddus must be a whole number.");
  }
  if (input.totalTokens > MAX_TOKEN_CAPACITY) {
    throw new Error("That is more Token Laddus than a festival can have.");
  }
  const capacity = readTokenCapacity(input.config);
  if (input.totalTokens < capacity.registered) {
    // Capacity is also the draw count, so dropping it below the tokens already
    // sold would mean fewer draws than participants who paid.
    throw new Error(
      `${capacity.registered} Token ${capacity.registered === 1 ? "Laddu is" : "Laddus are"} already registered. Set at least that many.`
    );
  }
  if (input.totalTokens < capacity.total && !input.reason?.trim()) {
    throw new Error("Give a reason for reducing the number of Token Laddus.");
  }
}

export type DrawReadiness = {
  plannedDraws: number;
  completedDraws: number;
  remainingDraws: number;
  eligibleCount: number;
  /** Fewer tokens in the pot than draws left — stop, do not invent winners. */
  shortfall: boolean;
  canDraw: boolean;
  /** Why the draw button is off, when it is. */
  blockedReason?: string;
};

/**
 * Whether another draw may run.
 *
 * The shortfall case is the one that matters: KAN-125 requires we stop safely
 * and say so rather than duplicate a winner to fill the remaining draws.
 */
export function readDrawReadiness(input: {
  plannedDraws: number;
  completedDraws: number;
  eligibleCount: number;
  sessionStatus?: string;
}): DrawReadiness {
  const plannedDraws = Math.max(0, Math.trunc(input.plannedDraws));
  const completedDraws = Math.max(0, Math.trunc(input.completedDraws));
  const eligibleCount = Math.max(0, Math.trunc(input.eligibleCount));
  const remainingDraws = Math.max(0, plannedDraws - completedDraws);
  const shortfall = eligibleCount < remainingDraws;

  let blockedReason: string | undefined;
  if (input.sessionStatus && input.sessionStatus !== "open") {
    blockedReason = "This draw is finished.";
  } else if (remainingDraws === 0) {
    blockedReason = "Every draw is done.";
  } else if (eligibleCount === 0) {
    blockedReason = "No Token Laddus are left in the draw.";
  }

  return {
    plannedDraws,
    completedDraws,
    remainingDraws,
    eligibleCount,
    shortfall,
    canDraw: !blockedReason,
    blockedReason,
  };
}

/** Tokens still in the pot, in a stable order. */
export function eligibleTokens(tokens: readonly TokenLadduToken[]): TokenLadduToken[] {
  return tokens
    .filter((token) => token.status === "eligible")
    .sort((a, b) => a.tokenNumber - b.tokenNumber);
}

/**
 * Picks a winner uniformly from the eligible pot.
 *
 * `random` is injected rather than called inline so the selection is testable
 * and so the server can hand in a cryptographic source — `Math.random` is not
 * the right tool for something a committee announces publicly.
 *
 * Returns null on an empty pot; the caller stops rather than inventing a winner.
 */
export function pickWinner<T>(pool: readonly T[], random: (bound: number) => number): T | null {
  if (pool.length === 0) return null;
  const index = random(pool.length);
  if (!Number.isInteger(index) || index < 0 || index >= pool.length) {
    throw new Error("Draw selection produced an invalid index.");
  }
  return pool[index];
}
