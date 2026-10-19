/**
 * SPENDLY-173: body padding for `common/Modal` sheets. The default is what
 * every sheet has always had; `compact` goes with clearing Gluestack's own
 * ModalContent `p-6` and ModalBody margins, giving the standard 16dp gutter
 * for dense forms such as Add Transaction.
 *
 * Pure module (no react-native) so it can be pinned in a unit test.
 */
export type SheetDensity = "default" | "compact";

export function sheetBodyPadding(density: SheetDensity, { withFooter = false }: { withFooter?: boolean } = {}) {
  const gutter = sheetGutter(density);
  // A pinned footer supplies its own space below the last field.
  const paddingBottom = withFooter ? 12 : density === "compact" ? 24 : 40;
  return density === "compact"
    ? { paddingHorizontal: gutter, paddingTop: 12, paddingBottom }
    : { paddingHorizontal: gutter, paddingTop: 20, paddingBottom };
}

/** Horizontal gutter of a sheet: the body and its footer line up on it. */
export function sheetGutter(density: SheetDensity): number {
  return density === "compact" ? 16 : 20;
}

/**
 * SPENDLY-548: the pinned footer of a form sheet (`common/Modal` `footer`).
 * It sits below the scrolling body, so the primary action never scrolls out
 * of reach on a long form. Same gutter as the body; a hairline above it.
 */
export function sheetFooterPadding(density: SheetDensity) {
  return { paddingHorizontal: sheetGutter(density), paddingTop: 12, paddingBottom: 4 };
}
