import type { CashbackKind } from "../types/expense";
import { roundMoney } from "./money";

/**
 * Deterministic document id for a cashback record.
 *
 * The same submission always resolves to the same id, so a double-tap, a retry
 * after a dropped connection, or the same entry made on a second device is a
 * `setDoc` over the same document rather than a second credit. Random ids with
 * a local guard are what let duplicate statements and double subscription
 * charges through elsewhere in this app; this avoids that class of bug by
 * construction rather than by remembering to guard.
 *
 * `discriminator` exists for the case the dedupe is wrong: two genuinely
 * separate credits of the same amount, on the same day, against the same
 * purchase. The user has to confirm that explicitly before one is passed.
 */
export function cashbackDocId(input: {
  cardId: string;
  amount: number;
  date: string;
  kind: CashbackKind;
  linkedExpenseId?: string;
  discriminator?: string;
}): string {
  const key = [
    input.cardId,
    input.date,
    roundMoney(input.amount).toFixed(2),
    input.kind,
    input.linkedExpenseId || "",
    input.discriminator || "",
  ].join("|");
  return `cashback_${hash32(key, 0x811c9dc5)}${hash32(key, 0x01000193)}`;
}

/**
 * FNV-1a over two seeds, giving 64 bits of key. Not cryptographic — it only
 * has to make an accidental collision between two different cashback entries
 * of one user implausible, and it must be synchronous and dependency-free so
 * the shared layer and its tests can use it.
 */
function hash32(value: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
