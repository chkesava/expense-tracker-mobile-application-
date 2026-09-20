/**
 * Durable brute-force lockout for the privacy lock — SPENDLY-22 (AUTH-04).
 *
 * The counter used to live in `lib/privacySession.ts`'s in-memory `Map`, so
 * five failed attempts cost an attacker one force-stop. The app *starting*
 * locked when the process dies is intended and stays in `privacySession`; the
 * record of how many times someone has guessed wrong is not session state and
 * belongs on disk.
 *
 * Per-uid, so one account's failures cannot lock another out on a shared
 * device, and so signing out as someone else is not a reset.
 *
 * This and SecureStore — not the iteration count in `lib/pinVault.ts` — are
 * what actually make a 4-digit PIN defensible.
 */

import { logError } from "./errors";
import {
  secureKeySegment,
  secureKeyValue,
  type SecureKeyValueStore,
} from "./secureKeyValue";

export const PRIVACY_LOCKOUT_KEY_PREFIX = "spendly.privacy.lockout.v1.";

/**
 * Cumulative failures → how long the next lockout lasts.
 *
 * The first entry preserves the previous behaviour exactly (5 attempts, 30
 * seconds); everything past it is new. The cap is a day: long enough to make
 * guessing pointless, short enough that a forgetful owner is not permanently
 * shut out of an app whose recovery path is "sign out and sign back in".
 */
export const LOCKOUT_SCHEDULE_MS: ReadonlyArray<{
  atAttempts: number;
  durationMs: number;
}> = [
  { atAttempts: 5, durationMs: 30_000 },
  { atAttempts: 6, durationMs: 2 * 60_000 },
  { atAttempts: 7, durationMs: 10 * 60_000 },
  { atAttempts: 8, durationMs: 60 * 60_000 },
  { atAttempts: 9, durationMs: 24 * 60 * 60_000 },
];

export type LockoutState = {
  attempts: number;
  lockoutUntil: number | null;
  /** When the current lockout began. Only used to detect a clock moved back. */
  lockedAt: number | null;
};

const EMPTY: LockoutState = { attempts: 0, lockoutUntil: null, lockedAt: null };

let storageOverride: SecureKeyValueStore | null = null;
let mirror: LockoutState = { ...EMPTY };
let hydratedUid: string | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function storage(): SecureKeyValueStore {
  return storageOverride ?? secureKeyValue;
}

function keyFor(uid: string): string {
  return `${PRIVACY_LOCKOUT_KEY_PREFIX}${secureKeySegment(uid)}`;
}

/** Duration for a given cumulative attempt count; 0 means "no lockout yet". */
export function lockoutDurationFor(attempts: number): number {
  let duration = 0;
  for (const step of LOCKOUT_SCHEDULE_MS) {
    if (attempts >= step.atAttempts) duration = step.durationMs;
  }
  return duration;
}

function parse(raw: string | null): LockoutState {
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Partial<LockoutState>;
    return {
      attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
      lockoutUntil:
        typeof parsed.lockoutUntil === "number" ? parsed.lockoutUntil : null,
      lockedAt: typeof parsed.lockedAt === "number" ? parsed.lockedAt : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * A lockout cannot be escaped by winding the clock back.
 *
 * If the device clock now reads earlier than the moment the lockout started,
 * something moved it. Restart the full duration from now rather than trusting
 * either timestamp.
 */
function reconcileClock(state: LockoutState, now: number): LockoutState {
  if (state.lockedAt === null || state.lockoutUntil === null) return state;
  if (now >= state.lockedAt) return state;
  return {
    ...state,
    lockedAt: now,
    lockoutUntil: now + lockoutDurationFor(state.attempts),
  };
}

function persist(uid: string): void {
  const snapshot = { ...mirror };
  writeChain = writeChain
    .then(() => storage().setItem(keyFor(uid), JSON.stringify(snapshot)))
    .catch((e) => {
      // A lockout we could not write is worse than useless to shout about
      // mid-unlock; the in-memory mirror still holds for this session.
      logError("privacyLockout.persist", e);
    });
}

/**
 * Load this uid's record into the synchronous mirror.
 *
 * Callers await this once at startup, so every later read can stay synchronous
 * for `PrivacyLock` and `AuthProvider`.
 */
export async function hydratePrivacyLockout(uid: string): Promise<LockoutState> {
  try {
    const state = parse(await storage().getItem(keyFor(uid)));
    const reconciled = reconcileClock(state, Date.now());
    mirror = reconciled;
    hydratedUid = uid;
    if (reconciled !== state) persist(uid);
  } catch (e) {
    logError("privacyLockout.hydrate", e);
    mirror = { ...EMPTY };
    hydratedUid = uid;
  }
  return { ...mirror };
}

export function getLockoutState(): LockoutState {
  return { ...mirror };
}

export function getFailedAttempts(): number {
  return mirror.attempts;
}

/** The active lockout's expiry, or null when none is running. */
export function getLockoutUntil(): number | null {
  if (mirror.lockoutUntil === null) return null;
  return mirror.lockoutUntil > Date.now() ? mirror.lockoutUntil : null;
}

export function isLockedOut(): boolean {
  return getLockoutUntil() !== null;
}

/**
 * Count a wrong PIN and start the next lockout if one is due.
 *
 * Updates the mirror synchronously so the UI can react without waiting on
 * storage, then persists in the background.
 */
export function recordFailedAttempt(): LockoutState {
  const attempts = mirror.attempts + 1;
  const duration = lockoutDurationFor(attempts);
  const now = Date.now();
  mirror = {
    attempts,
    lockoutUntil: duration > 0 ? now + duration : mirror.lockoutUntil,
    lockedAt: duration > 0 ? now : mirror.lockedAt,
  };
  if (hydratedUid) persist(hydratedUid);
  return { ...mirror };
}

/**
 * Retire an expired lockout, keeping the attempt count.
 *
 * The count is what makes the next lockout longer than the last, so only a
 * successful unlock may reset it — see {@link clearLockoutAfterSuccess}. The
 * previous implementation zeroed the count here, which is why backoff was
 * impossible.
 */
export function clearActiveLockout(): void {
  if (mirror.lockoutUntil === null) return;
  mirror = { ...mirror, lockoutUntil: null, lockedAt: null };
  if (hydratedUid) persist(hydratedUid);
}

/** The only reset. Called when a PIN — real or duress — actually works. */
export function clearLockoutAfterSuccess(): void {
  mirror = { ...EMPTY };
  if (hydratedUid) persist(hydratedUid);
}

/**
 * Forget a uid's record entirely. For "remove PIN", not for signing out.
 *
 * Goes through the same write chain as {@link persist}: a delete that raced
 * ahead of an already-queued write would be undone by it a moment later.
 */
export async function forgetPrivacyLockout(uid: string): Promise<void> {
  if (hydratedUid === uid) mirror = { ...EMPTY };
  writeChain = writeChain
    .then(() => storage().removeItem(keyFor(uid)))
    .catch((e) => {
      logError("privacyLockout.forget", e);
    });
  await writeChain;
}

/** Swap the backing store and reset the mirror. Tests only. */
export function resetPrivacyLockoutForTests(
  store: SecureKeyValueStore | null,
): void {
  storageOverride = store;
  mirror = { ...EMPTY };
  hydratedUid = null;
  writeChain = Promise.resolve();
}

/** Let a test await the background writes. */
export async function flushPrivacyLockoutWrites(): Promise<void> {
  await writeChain;
}
