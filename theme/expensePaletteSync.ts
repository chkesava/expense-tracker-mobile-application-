import { isExpensePaletteName, type ExpensePaletteName } from "./tokens";

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
 * A user-document snapshot applies unless a local selection is still being
 * written and the snapshot disagrees with it. That snapshot is older than the
 * selection, or a change from another device that the pending write is about
 * to overwrite.
 */
export function acceptRemotePalette(remote: unknown, pending: ExpensePaletteName | null): ExpensePaletteName | null {
  if (!isExpensePaletteName(remote)) return null;
  if (pending !== null && remote !== pending) return null;
  return remote;
}
