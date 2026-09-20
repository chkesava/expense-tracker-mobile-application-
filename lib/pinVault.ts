/**
 * Device-local storage and verification of the privacy PIN — SPENDLY-22 (AUTH-04).
 *
 * Replaces `lib/pinSecurity.ts`, which hashed a 4-digit PIN with a single
 * unsalted SHA-256 and stored the result on `users/{uid}.privacyPin`. That
 * value synced to every device and to anyone who could read the user document;
 * 10,000 candidates against a static rainbow table is not a hash, it is an
 * encoding. It also accepted a plaintext PIN if the stored value did not look
 * like a hash, a migration shim that never expired.
 *
 * ## What this actually protects, and what it does not
 *
 * A 4-digit PIN is a 10,000-element space. At {@link PBKDF2_ITERATIONS} that is
 * on the order of 10^9 PBKDF2 operations to enumerate — minutes on a GPU. The
 * KDF is a speed bump, not a wall, and nothing here changes that.
 *
 * The real controls are:
 *
 * 1. **Where it lives.** SecureStore is backed by the Android Keystore / iOS
 *    Keychain, so the blob is not readable without compromising the device.
 *    That, not the KDF, is what the move off Firestore buys. (On web there is
 *    no keychain — see `lib/secureKeyValue.web.ts`.)
 * 2. **`lib/privacyLockout.ts`**, which makes online guessing expensive and,
 *    unlike the counter it replaces, survives a force-stop.
 *
 * `docs/SPENDLY-22-privacy-lock-boundary.md` says the same thing in prose.
 * Keep the two honest with each other.
 */

import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

import {
  secureKeySegment,
  secureKeyValue,
  type SecureKeyValueStore,
} from "./secureKeyValue";

export const PIN_VAULT_VERSION = 1;
export const PIN_VAULT_KEY_PREFIX = "spendly.privacy.pin.v1.";

/**
 * PBKDF2-SHA256 rounds for a newly stored PIN.
 *
 * Measured at ~350k iterations/sec warm on desktop Node, so 50k is ~146ms
 * there. Hermes on a mid-range Android is several times slower, which puts
 * this in the region of half a second to a second and a half on the devices
 * that matter — and this runs on every unlock, not just enrolment.
 *
 * The count is stored per entry, so raising or lowering it later costs one
 * line and existing PINs keep working: {@link verifyPin} re-derives anything
 * below the current value on the next successful unlock. If a real device
 * measures much past ~600ms, lower this rather than making unlock feel broken
 * — per the module comment, the iteration count is not what is holding the
 * line here.
 */
export const PBKDF2_ITERATIONS = 50_000;

/** 128-bit, fresh per entry rather than per device. */
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;

export type PinEntry =
  | {
      algo: "pbkdf2-sha256";
      salt: string;
      iterations: number;
      hash: string;
      createdAt: number;
    }
  | {
      /**
       * A PIN carried over from the Firestore era, whose plaintext we never
       * learned. Verifies exactly as it used to and is upgraded in place on the
       * first successful unlock — see {@link verifyPin}.
       */
      algo: "legacy-sha256-unsalted";
      hash: string;
    };

export type PinVault = {
  v: number;
  real: PinEntry | null;
  duress: PinEntry | null;
};

export type PinVerdict = "real" | "duress" | "none";

const EMPTY_VAULT: PinVault = { v: PIN_VAULT_VERSION, real: null, duress: null };

let storageOverride: SecureKeyValueStore | null = null;
let iterationsOverride: number | null = null;

/**
 * The cost applied to a PIN stored right now.
 *
 * Tests lower it so the suite is not spending seconds proving that PBKDF2 is
 * slow — which is its job, and which `@noble/hashes` already proves. The
 * constant itself is asserted separately, and `deriveHash` is tested directly.
 */
function currentIterations(): number {
  return iterationsOverride ?? PBKDF2_ITERATIONS;
}

function storage(): SecureKeyValueStore {
  return storageOverride ?? secureKeyValue;
}

/** Swap the backing store. Tests only. */
export function setPinVaultStorageForTests(
  store: SecureKeyValueStore | null,
): void {
  storageOverride = store;
}

/** Lower the KDF cost. Tests only; see {@link currentIterations}. */
export function setPinVaultIterationsForTests(iterations: number | null): void {
  iterationsOverride = iterations;
}

export function pinVaultKey(uid: string): string {
  return `${PIN_VAULT_KEY_PREFIX}${secureKeySegment(uid)}`;
}

/**
 * Compare two hex digests without leaking where they diverge.
 *
 * Length is public — it is a function of the algorithm, not the secret.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function deriveHash(
  pin: string,
  saltHex: string,
  iterations: number,
): string {
  return bytesToHex(
    pbkdf2(sha256, utf8ToBytes(pin), hexToBytes(saltHex), {
      c: iterations,
      dkLen: DERIVED_KEY_BYTES,
    }),
  );
}

/** The digest `lib/pinSecurity.ts` used to write. Verification only. */
export function legacyHash(pin: string): string {
  return bytesToHex(sha256(utf8ToBytes(pin)));
}

async function randomSaltHex(): Promise<string> {
  const Crypto = await import("expo-crypto");
  return bytesToHex(await Crypto.getRandomBytesAsync(SALT_BYTES));
}

export async function buildPinEntry(pin: string): Promise<PinEntry> {
  const salt = await randomSaltHex();
  const iterations = currentIterations();
  return {
    algo: "pbkdf2-sha256",
    salt,
    iterations,
    hash: deriveHash(pin, salt, iterations),
    createdAt: Date.now(),
  };
}

function isPinEntry(value: unknown): value is PinEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as PinEntry;
  if (entry.algo === "legacy-sha256-unsalted") {
    return typeof entry.hash === "string";
  }
  return (
    entry.algo === "pbkdf2-sha256" &&
    typeof entry.hash === "string" &&
    typeof entry.salt === "string" &&
    typeof entry.iterations === "number" &&
    entry.iterations > 0
  );
}

/**
 * Read the vault, failing closed.
 *
 * A corrupt or unreadable blob reads as "no PIN set" rather than throwing. The
 * alternative is an app that cannot start; the cost is that a corrupted vault
 * silently disables the lock, which the user can see and fix.
 */
export async function readPinVault(uid: string): Promise<PinVault> {
  let raw: string | null = null;
  try {
    raw = await storage().getItem(pinVaultKey(uid));
  } catch {
    return EMPTY_VAULT;
  }
  if (!raw) return EMPTY_VAULT;
  try {
    const parsed = JSON.parse(raw) as Partial<PinVault>;
    return {
      v: typeof parsed.v === "number" ? parsed.v : PIN_VAULT_VERSION,
      real: isPinEntry(parsed.real) ? parsed.real : null,
      duress: isPinEntry(parsed.duress) ? parsed.duress : null,
    };
  } catch {
    return EMPTY_VAULT;
  }
}

async function writePinVault(uid: string, vault: PinVault): Promise<void> {
  if (!vault.real && !vault.duress) {
    await storage().removeItem(pinVaultKey(uid));
    return;
  }
  await storage().setItem(pinVaultKey(uid), JSON.stringify(vault));
}

export async function getPinStatus(
  uid: string,
): Promise<{ hasReal: boolean; hasDuress: boolean }> {
  const vault = await readPinVault(uid);
  return { hasReal: Boolean(vault.real), hasDuress: Boolean(vault.duress) };
}

export async function setRealPin(uid: string, pin: string): Promise<void> {
  const vault = await readPinVault(uid);
  await writePinVault(uid, { ...vault, real: await buildPinEntry(pin) });
}

/**
 * A duress PIN without a real one would unlock nothing and would advertise
 * itself by existing, so it is refused — the same precondition the Settings
 * screen enforces.
 */
export async function setDuressPin(uid: string, pin: string): Promise<boolean> {
  const vault = await readPinVault(uid);
  if (!vault.real) return false;
  await writePinVault(uid, { ...vault, duress: await buildPinEntry(pin) });
  return true;
}

export async function clearDuressPin(uid: string): Promise<void> {
  const vault = await readPinVault(uid);
  await writePinVault(uid, { ...vault, duress: null });
}

export async function clearAllPins(uid: string): Promise<void> {
  await storage().removeItem(pinVaultKey(uid));
}

function entryMatches(entry: PinEntry | null, pin: string): boolean {
  if (!entry) return false;
  if (entry.algo === "legacy-sha256-unsalted") {
    return timingSafeEqualHex(legacyHash(pin), entry.hash);
  }
  return timingSafeEqualHex(
    deriveHash(pin, entry.salt, entry.iterations),
    entry.hash,
  );
}

function needsUpgrade(entry: PinEntry | null): boolean {
  if (!entry) return false;
  if (entry.algo === "legacy-sha256-unsalted") return true;
  return entry.iterations < currentIterations();
}

/**
 * Decide what a PIN opens.
 *
 * Both entries are evaluated with **no short-circuit**. Returning as soon as
 * the real PIN matches would make the duress entry's existence observable by
 * timing, and "nobody can tell a duress PIN is configured" is the entire
 * proposition of duress mode.
 *
 * This is also the only place the plaintext PIN is ever in hand, so it is the
 * only place a stored entry can be re-derived — a legacy import or an entry
 * below the current iteration count is upgraded here, before returning.
 */
export async function verifyPin(uid: string, pin: string): Promise<PinVerdict> {
  const vault = await readPinVault(uid);
  const realMatched = entryMatches(vault.real, pin);
  const duressMatched = entryMatches(vault.duress, pin);

  if (!realMatched && !duressMatched) return "none";

  // Real wins if both somehow match; the Settings screen refuses equal PINs.
  const verdict: PinVerdict = realMatched ? "real" : "duress";
  const matchedEntry = realMatched ? vault.real : vault.duress;
  if (needsUpgrade(matchedEntry)) {
    const upgraded = await buildPinEntry(pin);
    await writePinVault(
      uid,
      realMatched ? { ...vault, real: upgraded } : { ...vault, duress: upgraded },
    );
  }
  return verdict;
}

/**
 * Adopt PINs that were living in Firestore.
 *
 * A **plaintext** legacy value is a PIN we know, so it becomes a full PBKDF2
 * entry immediately and the plaintext-comparison path dies with it. A **64-hex**
 * legacy value is a PIN we do not know, so it is kept as-is and keeps working
 * unchanged; {@link verifyPin} upgrades it the first time the user unlocks.
 * Either way nobody is locked out and nobody is asked to re-enrol.
 *
 * Existing vault entries are never overwritten — a re-run after a crashed
 * migration must not clobber a PIN the user has since set on this device.
 */
export async function importLegacyPins(
  uid: string,
  legacy: { real?: string; duress?: string },
): Promise<void> {
  const vault = await readPinVault(uid);
  let next = vault;

  if (!next.real && legacy.real) {
    next = { ...next, real: await legacyEntryFor(legacy.real) };
  }
  // Same precondition as `setDuressPin`: never a duress PIN on its own.
  if (next.real && !next.duress && legacy.duress) {
    next = { ...next, duress: await legacyEntryFor(legacy.duress) };
  }
  if (next !== vault) await writePinVault(uid, next);
}

function isLikelyLegacyHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

async function legacyEntryFor(value: string): Promise<PinEntry> {
  if (isLikelyLegacyHash(value)) {
    return { algo: "legacy-sha256-unsalted", hash: value.toLowerCase() };
  }
  return buildPinEntry(value);
}
