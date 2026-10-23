import { Text, View } from "react-native";

import type { Freshness } from "@/shared/utils/readModelFreshness";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * SPENDLY-511 — "Updating…" or "Data may be out of date — last synced HH:MM"
 * on a screen that reads the read model, or (SPENDLY-513) that it fell back
 * to live data. Renders nothing when there is
 * nothing to say, including on every Firestore-backed screen.
 */
export function ReadModelFreshnessBadge({ freshness }: { freshness: Freshness | null }) {
  const { theme } = useTheme();
  if (!freshness?.label) return null;
  const color = freshness.state === "stale" || freshness.state === "fallback" ? theme.colors.warning : theme.colors.mutedForeground;
  return (
    <View accessibilityRole="text" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
      <Text style={{ color, fontFamily: theme.fontFamily.medium, fontSize: 12 }}>{freshness.label}</Text>
    </View>
  );
}
