import { isExpensePaletteName, resolveExpensePalette, type ExpensePaletteName } from "./tokens";

/**
 * SPENDLY-618: ordering rules for the Expense palette preference, which has
 * three sources: the startup AsyncStorage read, the `users/{uid}` listener
 * and the user's own selection. Pure so the races are testable.
 */

/**
 * The startup AsyncStorage read is the oldest source. It applies only if
 * neither the user document nor a selection has supplied a palette yet.
 */
export function acceptStoredPalette(stored: unknown, alreadyResolved: boolean): ExpensePaletteName | null {
  if (alreadyResolved || !isExpensePaletteName(stored)) return null;
  return stored;
}

/**
 * The palette a user-document snapshot sets, or null to leave it unchanged.
 *
 * - Nothing applies until the document has loaded for the signed-in account.
 *   During an account switch the provider briefly still holds the previous
 *   account's data, and a failed read says nothing about the value.
 * - While a local selection is still being written, only a snapshot that
 *   agrees with it applies. Others are older than the selection, or a change
 *   from another device that the pending write is about to overwrite.
 * - A loaded document with no saved palette means Slate, so one account's
 *   choice never carries over to another account.
 */
export function acceptRemotePalette(
  remote: unknown,
  pending: ExpensePaletteName | null,
  loaded: boolean
): ExpensePaletteName | null {
  if (!loaded) return null;
  if (pending !== null) return remote === pending ? pending : null;
  return resolveExpensePalette(remote);
}

/**
 * The newest local selection while its write is in flight, scoped to the
 * account that made it. Signing in as another account never blocks that
 * account's own palette. Only the newest selection's write clears the
 * marker, so an older write finishing first (A → B → A) leaves the newest
 * selection protected.
 */
export function createPendingPalette() {
  let generation = 0;
  let pending: { uid: string | null; palette: ExpensePaletteName; generation: number } | null = null;
  return {
    /** Records a selection; returns the token to pass to `complete`. */
    begin(uid: string | null, palette: ExpensePaletteName): number {
      generation += 1;
      pending = { uid, palette, generation };
      return generation;
    },
    /** A write finished; clears the marker only if it was the newest. */
    complete(token: number): void {
      if (pending?.generation === token) pending = null;
    },
    /** The palette still being written for `uid`, or null. */
    pendingFor(uid: string | null): ExpensePaletteName | null {
      return pending && pending.uid === uid ? pending.palette : null;
    },
  };
}
