import { type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IndianRupee } from "lucide-react-native";

import { FestivalGarlandBells } from "@/components/ganesh/art/FestivalChrome";
import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useTheme } from "@/theme/ThemeProvider";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

/**
 * Funds identity. Restrained: garland, bells, a faint temple. No Ganesha,
 * no date strip — money stays the point of this tab.
 */
export function PandalNidhiHero({
  festivalName,
  rightAccessory,
}: {
  festivalName?: string;
  rightAccessory?: ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const insets = useSafeAreaInsets();
  const { temple } = useArtScale();
  const maroon = g.isDark ? "#3A1020" : "#7A1836";

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: maroon,
          paddingTop: insets.top + 8,
          experimental_backgroundImage: g.isDark
            ? "linear-gradient(180deg, #4A1628 0%, #3A1020 88%)"
            : "linear-gradient(180deg, #9B2C4A 0%, #7A1836 62%, #64142C 100%)",
        },
      ]}
    >
      <FestivalGarlandBells />
      <View pointerEvents="none" style={styles.templeWrap}>
        <GaneshArt name="temple" width={temple * 0.72} height={temple * 0.58} opacity={0.28} />
      </View>

      {rightAccessory ? <View style={styles.topBar}>{rightAccessory}</View> : null}

      <View style={styles.row}>
        <View
          style={styles.mark}
          accessibilityRole="image"
          accessibilityLabel="Pandal Nidhi"
        >
          <IndianRupee size={22} color="#7A1836" strokeWidth={2.4} />
        </View>
        <View style={styles.copy}>
          <Text
            style={[styles.title, { fontFamily: TITLE_FONT ?? theme.fontFamily.bold }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            Pandal Nidhi
          </Text>
          {festivalName ? (
            <Text
              style={[styles.festival, { color: "#E8C36A", fontFamily: theme.fontFamily.medium }]}
              numberOfLines={1}
            >
              ✿  {festivalName.toUpperCase()}  ✿
            </Text>
          ) : null}
        </View>
      </View>

      <View pointerEvents="none" style={[styles.curveBite, { backgroundColor: theme.colors.background }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    overflow: "hidden",
    minHeight: 112,
  },
  templeWrap: {
    position: "absolute",
    right: -4,
    bottom: 16,
    zIndex: 1,
  },
  topBar: {
    alignItems: "flex-end",
    zIndex: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 3,
    marginTop: 10,
    paddingRight: 72,
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: "#FFF8F1",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: "#FFF8F1",
    fontSize: 26,
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  festival: {
    fontSize: 11.5,
    letterSpacing: 0.4,
  },
  curveBite: {
    position: "absolute",
    bottom: -1,
    left: -40,
    right: -40,
    height: 22,
    borderTopLeftRadius: 140,
    borderTopRightRadius: 140,
  },
});
