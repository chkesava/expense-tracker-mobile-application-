/**
 * Backward-compatible Colors map for leftover template code.
 * Prefer `useTheme()` / `theme/tokens` for new UI.
 */
import { darkColors, lightColors } from "@/theme/tokens";

export default {
  light: {
    text: lightColors.foreground,
    background: lightColors.background,
    tint: lightColors.tint,
    tabIconDefault: lightColors.tabIconDefault,
    tabIconSelected: lightColors.tabIconSelected,
  },
  dark: {
    text: darkColors.foreground,
    background: darkColors.background,
    tint: darkColors.tint,
    tabIconDefault: darkColors.tabIconDefault,
    tabIconSelected: darkColors.tabIconSelected,
  },
};
