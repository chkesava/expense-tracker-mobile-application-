import { type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FestivalDateStrip } from "@/components/ganesh/art/FestivalDateStrip";
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
 * Seva tab identity. Temple and bells decorate; the title and dates stay live.
 */
export function SevaHero({
  festivalName,
  festival,
  today,
  onFestivalDates,
  rightAccessory,
}: {
  festivalName?: string;
  festival?: { startDate?: string; endDate?: string; name?: string } | null;
  today?: string;
  onFestivalDates?: () => void;
  rightAccessory?: ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const insets = useSafeAreaInsets();
  const { temple, mandala } = useArtScale();
  const maroon = g.isDark ? "#3A1020" : "#7A1836";

  return (
    <View style={styles.wrap}>
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
        <View pointerEvents="none" style={styles.mandalaWrap}>
          <GaneshArt name="mandala" width={mandala} height={mandala} opacity={0.1} />
        </View>
        <FestivalGarlandBells />
        <View pointerEvents="none" style={styles.templeWrap}>
          <GaneshArt name="temple" width={temple} height={temple * 0.82} opacity={0.42} />
        </View>

        <View style={styles.row}>
          <View style={styles.mark}>
            <GaneshArt name="diya" width={28} height={28} />
          </View>
          <View style={styles.copy}>
            <Text
              style={[styles.title, { fontFamily: TITLE_FONT ?? theme.fontFamily.bold }]}
              numberOfLines={1}
            >
              Seva
            </Text>
            {festivalName ? (
              <Text
                style={[styles.festival, { color: "#E8C36A", fontFamily: theme.fontFamily.medium }]}
                numberOfLines={1}
              >
                ✿  {festivalName}  ✿
              </Text>
            ) : null}
          </View>
          {rightAccessory}
        </View>

        <View pointerEvents="none" style={[styles.curveBite, { backgroundColor: theme.colors.background }]} />
      </View>

      <FestivalDateStrip festival={festival} today={today} onPress={onFestivalDates} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 4,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 34,
    overflow: "hidden",
    minHeight: 128,
  },
  mandalaWrap: {
    position: "absolute",
    left: -48,
    top: -18,
    zIndex: 0,
  },
  templeWrap: {
    position: "absolute",
    right: -8,
    bottom: 18,
    zIndex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 3,
    marginTop: 18,
    paddingRight: 88,
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
    fontSize: 28,
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  festival: {
    fontSize: 13,
  },
  curveBite: {
    position: "absolute",
    bottom: -1,
    left: -40,
    right: -40,
    height: 26,
    borderTopLeftRadius: 140,
    borderTopRightRadius: 140,
  },
});
