/**
 * Presentation decisions that are not rendering — KAN-73.
 *
 * The tone a status carries is domain logic (`contributionStatusMeta`,
 * `transferStatusMeta` both return one). Turning that tone into a theme colour
 * was written out twice, byte for byte, in `EpfContributionRow` and
 * `EpfTransfersList`. This returns the theme *key*, not a colour, so the
 * mapping stays testable and the component still owns its theme lookup.
 */

/** The tone vocabulary the EPF status helpers emit. */
export type EpfTone = "success" | "warning" | "info" | "neutral" | (string & {});

/** Keys on the app theme's colour palette. */
export type ThemeColorKey = "success" | "destructive" | "primary" | "mutedForeground";

/**
 * Note `warning` maps to `destructive`, which looks wrong and is not: an EPF
 * month in a warning tone is a missed or reversed credit, and the palette has
 * no amber. Both copies did this; it is preserved deliberately rather than
 * quietly "fixed" into a colour the theme does not define.
 */
export function statusToneKey(tone: EpfTone): ThemeColorKey {
  switch (tone) {
    case "success":
      return "success";
    case "warning":
      return "destructive";
    case "info":
      return "primary";
    default:
      return "mutedForeground";
  }
}
