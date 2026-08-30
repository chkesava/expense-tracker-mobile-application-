import { type ReactNode } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FestivalGarlandBells } from "@/components/ganesh/art/FestivalChrome";
import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { FESTIVAL_CHROME_ART } from "@/components/ganesh/chrome/festivalArt";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useTheme } from "@/theme/ThemeProvider";

import { PANDAL_ART } from "./pandalArt";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

const GOLD = "#E8C36A";

/**
 * Pandal chrome. Curve medallion, saffron flag, and a Ganesha mark — same
 * festival family as Home, not a pixel copy of any poster.
 */
export function PandalTabHero({
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
          <Image
            source={PANDAL_ART.temple}
            resizeMode="contain"
            style={{ width: temple * 0.95, height: temple * 0.95, opacity: 0.58 }}
          />
        </View>
        <View pointerEvents="none" style={styles.flagWrap}>
          <Image source={FESTIVAL_CHROME_ART.flag} resizeMode="contain" style={styles.flag} />
        </View>

        {rightAccessory ? <View style={styles.topBar}>{rightAccessory}</View> : null}

        <View style={styles.row}>
          <View style={styles.mark} accessibilityRole="image" accessibilityLabel="Pandal">
            <Image source={PANDAL_ART.temple} resizeMode="contain" style={styles.markGlyph} />
          </View>
          <View style={styles.copy}>
            <Text
              style={[styles.title, { fontFamily: TITLE_FONT ?? theme.fontFamily.bold }]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              Pandal
            </Text>
            {festivalName ? (
              <Text
                style={[styles.festival, { color: GOLD, fontFamily: theme.fontFamily.medium }]}
                numberOfLines={1}
              >
                ✿  {festivalName.toUpperCase()}  ✿
              </Text>
            ) : null}
          </View>
        </View>

        <View pointerEvents="none" style={[styles.curveBite, { backgroundColor: theme.colors.background }]} />
      </View>

      <View
        pointerEvents="none"
        style={styles.medallionWrap}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <Image source={FESTIVAL_CHROME_ART.medallion} resizeMode="contain" style={styles.medallion} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 34,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    overflow: "hidden",
    minHeight: 156,
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
    bottom: 16,
    zIndex: 1,
  },
  flagWrap: {
    position: "absolute",
    right: 108,
    bottom: 42,
    zIndex: 2,
  },
  flag: {
    width: 40,
    height: 60,
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
    paddingRight: 100,
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
    width: 28,
    height: 28,
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
  medallionWrap: {
    position: "absolute",
    alignSelf: "center",
    bottom: 0,
    zIndex: 5,
  },
  medallion: {
    width: 76,
    height: 76,
  },
});
