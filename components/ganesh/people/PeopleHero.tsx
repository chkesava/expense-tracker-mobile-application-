import { type ReactNode } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FestivalGarlandBells } from "@/components/ganesh/art/FestivalChrome";
import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useTheme } from "@/theme/ThemeProvider";

import { PEOPLE_ART } from "./peopleArt";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

/**
 * People identity. Maroon festival chrome, live festival name, no curve
 * medallion — the white people mark in the title row is enough.
 */
export function PeopleHero({
  festivalName,
  rightAccessory,
}: {
  festivalName?: string;
  rightAccessory?: ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const insets = useSafeAreaInsets();
  const { temple, mandala } = useArtScale();
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
      <View pointerEvents="none" style={styles.mandalaWrap}>
        <GaneshArt name="mandala" width={mandala} height={mandala} opacity={0.1} />
      </View>
      <FestivalGarlandBells />
      <View pointerEvents="none" style={styles.templeWrap}>
        <Image
          source={PEOPLE_ART.temple}
          resizeMode="contain"
          style={{ width: temple * 0.95, height: temple * 0.95, opacity: 0.62 }}
        />
      </View>

      {rightAccessory ? <View style={styles.topBar}>{rightAccessory}</View> : null}

      <View style={styles.row}>
        <View style={styles.mark} accessibilityRole="image" accessibilityLabel="People">
          <Image source={PEOPLE_ART.mark} style={styles.markGlyph} resizeMode="contain" />
        </View>
        <View style={styles.copy}>
          <Text
            style={[styles.title, { fontFamily: TITLE_FONT ?? theme.fontFamily.bold }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            People
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
    paddingBottom: 34,
    overflow: "hidden",
    minHeight: 148,
  },
  mandalaWrap: {
    position: "absolute",
    left: -48,
    top: -20,
    zIndex: 0,
  },
  templeWrap: {
    position: "absolute",
    right: -8,
    bottom: 10,
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
    marginTop: 14,
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
  markGlyph: {
    width: 26,
    height: 26,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: "#FFF8F1",
    fontSize: 28,
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  festival: {
    fontSize: 11.5,
    letterSpacing: 0.5,
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
