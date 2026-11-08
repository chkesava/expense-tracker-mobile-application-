/**
 * SPENDLY-722 — pure rules for the Add/Edit transaction form's category and
 * account fields, kept here so they're provable without rendering.
 */

/**
 * The subcategory to switch to when `subcategory` isn't one of the committed
 * parent's, or null when it is already valid (or the parent has none).
 *
 * It only ever fixes the subcategory of the parent the form holds. Choosing a
 * parent is the user's, never this rule's: validating against the picker's
 * draft parent instead made the picker and the form overwrite each other in
 * a loop (SPENDLY-722).
 */
export function reconcileSubcategory(
  subcategory: string,
  subcategoryNames: readonly string[]
): string | null {
  if (subcategoryNames.length === 0) return null;
  return subcategoryNames.includes(subcategory) ? null : subcategoryNames[0];
}

/**
 * The account a new transaction should use: the current choice while it
 * still exists, else the first account. While the list is empty (still
 * loading), the current choice is kept rather than cleared.
 */
export function defaultAccountId(currentId: string, accountIds: readonly string[]): string {
  if (accountIds.length === 0) return currentId;
  return currentId && accountIds.includes(currentId) ? currentId : accountIds[0];
}
