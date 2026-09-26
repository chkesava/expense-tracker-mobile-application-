/**
 * SPENDLY-173: `compact` is for dense forms (the Add Transaction sheet). The
 * default card stacks Gluestack's `p-4` on top of its own 16dp inner padding,
 * 32dp in total. Compact drops that outer layer (see `Card`) and uses tokens
 * for the inner one. Default rendering is unchanged for every existing caller.
 *
 * Pure module (no react-native) so the padding can be pinned in a unit test.
 */
export type CardDensity = "default" | "compact";

type SpaceScale = { md: number; lg: number };

export type CardContentPadding =
  | { padding: number }
  | { paddingHorizontal: number; paddingVertical: number };

/** Inner content padding for a density. */
export function cardContentPadding(density: CardDensity, space: SpaceScale): CardContentPadding {
  return density === "compact"
    ? { paddingHorizontal: space.lg, paddingVertical: space.md }
    : { padding: 16 };
}
