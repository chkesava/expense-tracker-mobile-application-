import { StyleSheet, View } from "react-native";

import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { useTheme } from "@/theme/ThemeProvider";

import { useGaneshTokens } from "./tokens";

/**
 * Login cream wash. Festival ornaments only — no Expense Tracker dot grid.
 */
export function GaneshAuthBackground() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { mandala, ganesha } = useArtScale();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}>
      <View pointerEvents="none" style={styles.mandala}>
        <GaneshArt name="mandala" width={mandala * 1.15} height={mandala * 1.15} opacity={g.isDark ? 0.12 : 0.08} />
      </View>
      <View pointerEvents="none" style={styles.lotus}>
        <GaneshArt name="lotusWatermark" width={ganesha * 1.4} height={ganesha * 1.4} opacity={g.isDark ? 0.1 : 0.07} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mandala: {
    position: "absolute",
    right: -80,
    top: 120,
  },
  lotus: {
    position: "absolute",
    left: -20,
    bottom: 40,
  },
});
