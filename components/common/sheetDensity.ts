/**
 * SPENDLY-173: body padding for `common/Modal` sheets. The default is what
 * every sheet has always had; `compact` goes with clearing Gluestack's own
 * ModalContent `p-6` and ModalBody margins, giving the standard 16dp gutter
 * for dense forms such as Add Transaction.
 *
 * Pure module (no react-native) so it can be pinned in a unit test.
 */
export type SheetDensity = "default" | "compact";

export function sheetBodyPadding(density: SheetDensity) {
  return density === "compact"
    ? { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }
    : { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 };
}
