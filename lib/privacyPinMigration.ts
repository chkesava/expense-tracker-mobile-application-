/**
 * Moving the privacy PIN off Firestore — SPENDLY-22 (AUTH-04).
 *
 * `users/{uid}.privacyPin` / `.fakePin` held an unsalted SHA-256 of a 4-digit
 * PIN, synced to every device and readable by anyone who could read the user
 * document. This plans the one-way move to `lib/pinVault.ts`.
 *
 * Pure on purpose: the provider that runs it needs React, Firestore and
 * SecureStore, and none of those belong in the part that decides what to do.
 *
 * ## What the user experiences
 *
 * Nothing. A **plaintext** legacy value is a PIN we know, so it becomes a
 * proper PBKDF2 entry immediately. A **64-hex** value is a PIN we do not know,
 * so it is carried across as-is and keeps working unchanged until the next
 * successful unlock quietly upgrades it. Nobody is locked out and nobody is
 * asked to re-enrol.
 *
 * ## The part that is not free
 *
 * A PIN that used to sync is now device-local. Once this clears the Firestore
 * fields, a second device still on the old build reads an empty PIN and its
 * lock silently turns off until it upgrades. That is the accepted cost of
 * getting the hash out of the database — see
 * `docs/SPENDLY-22-privacy-lock-boundary.md`.
 */

/** Firestore fields this migration drains, top-level and nested. */
export const LEGACY_PIN_FIELDS = ["privacyPin", "fakePin"] as const;

export type PinMigrationPlan = {
  /** Raw legacy values to hand to `importLegacyPins`. */
  importReal?: string;
  importDuress?: string;
  /** Dotted paths to delete from `users/{uid}`. */
  firestoreFieldsToClear: string[];
};

function readLegacy(
  doc: Record<string, unknown>,
  field: string,
): { value: string; path: string } | null {
  const top = doc[field];
  if (typeof top === "string" && top) return { value: top, path: field };

  // A doc written by an older web build nests its settings; miss this and a
  // hash stays in Firestore forever.
  const nested = doc.settings;
  if (nested && typeof nested === "object") {
    const value = (nested as Record<string, unknown>)[field];
    if (typeof value === "string" && value) {
      return { value, path: `settings.${field}` };
    }
  }
  return null;
}

/**
 * Decide what to import and what to delete.
 *
 * Idempotent: a re-run after a crash imports nothing it already imported, but
 * still asks for the Firestore clear, because that is the half most likely to
 * be the one that failed.
 */
export function planPinMigration(input: {
  docData: Record<string, unknown> | null;
  vault: { hasReal: boolean; hasDuress: boolean };
}): PinMigrationPlan {
  const doc = input.docData;
  if (!doc) return { firestoreFieldsToClear: [] };

  const real = readLegacy(doc, "privacyPin");
  const duress = readLegacy(doc, "fakePin");

  const firestoreFieldsToClear = [real?.path, duress?.path].filter(
    (path): path is string => Boolean(path),
  );

  const plan: PinMigrationPlan = { firestoreFieldsToClear };

  // Never overwrite a PIN this device already has: on a re-run, the vault is
  // the truth and Firestore is the leftover.
  if (!input.vault.hasReal && real) plan.importReal = real.value;

  // A duress PIN alone unlocks nothing and advertises itself by existing, so
  // it only comes across if a real PIN does too — matching `setDuressPin`.
  const willHaveReal = input.vault.hasReal || Boolean(plan.importReal);
  if (willHaveReal && !input.vault.hasDuress && duress) {
    plan.importDuress = duress.value;
  }

  return plan;
}

/** Whether a plan would do anything at all. */
export function planIsEmpty(plan: PinMigrationPlan): boolean {
  return (
    !plan.importReal &&
    !plan.importDuress &&
    plan.firestoreFieldsToClear.length === 0
  );
}
