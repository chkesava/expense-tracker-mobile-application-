import { type ReactNode } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { FestivalGarlandBells } from "@/components/ganesh/art/FestivalChrome";
import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { FESTIVAL_CHROME_ART } from "./festivalArt";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

const INK = "#FFF8F1";
const GOLD = "#E8C36A";

export type FestivalHeroProps = {
  title: string;
  /** Live festival (or short context) under the title. Never uppercase. */
  subtitle?: string;
  /** Optional quieter line — Pandal name on Admin. */
  context?: string;
  mark?: ReactNode;
  rightAccessory?: ReactNode;
  onBack?: () => void;
  showTemple?: boolean;
  showFlag?: boolean;
};

/**
 * Shared maroon chrome for every Ganesh tab and stack screen except Home.
 *
 * Identity first: mark, title, festival, sync. Garland, bells, and a faint
 * temple stay secondary and must not cover the title or the sync chip.
 */
export function FestivalHero({
  title,
  subtitle,
  context,
  mark,
  rightAccessory,
  onBack,
  showTemple = true,
  showFlag = false,
}: FestivalHeroProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { temple, mandala } = useArtScale();
  const maroon = g.isDark ? "#3A1020" : "#7A1836";

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: maroon,
          experimental_backgroundImage: g.isDark
            ? "linear-gradient(180deg, #4A1628 0%, #3A1020 88%)"
            : "linear-gradient(180deg, #9B2C4A 0%, #7A1836 62%, #64142C 100%)",
        },
      ]}
    >
      <View pointerEvents="none" style={styles.mandalaWrap}>
        <GaneshArt name="mandala" width={mandala} height={mandala} opacity={0.08} />
      </View>
      <FestivalGarlandBells />
      {showTemple ? (
        <View pointerEvents="none" style={styles.templeWrap}>
          <GaneshArt name="temple" width={temple} height={temple * 0.78} opacity={0.22} resizeMode="contain" />
        </View>
      ) : null}
      {showFlag ? (
        <View pointerEvents="none" style={styles.flagWrap}>
          <Image
            source={FESTIVAL_CHROME_ART.flag}
            resizeMode="contain"
            style={styles.flag}
          />
        </View>
      ) : null}

      {onBack || rightAccessory ? (
        <View style={styles.topBar}>
          {onBack ? (
            <Pressable
              onPress={() => {
                void haptic.selection();
                onBack();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.back, pressed ? { opacity: 0.75 } : null]}
            >
              <ArrowLeft size={22} color={INK} strokeWidth={2.2} />
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}
          {rightAccessory ? <View style={styles.topRight}>{rightAccessory}</View> : null}
        </View>
      ) : null}

      <View style={styles.row}>
        {mark}
        <View style={styles.copy}>
          <Text
            style={[styles.title, { fontFamily: TITLE_FONT ?? theme.fontFamily.bold }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {context ? (
            <Text
              style={[styles.context, { fontFamily: theme.fontFamily.medium }]}
              numberOfLines={1}
            >
              {context}
            </Text>
          ) : null}
          {subtitle ? (
            <Text
              style={[styles.subtitle, { fontFamily: theme.fontFamily.medium }]}
              numberOfLines={1}
            >
              {subtitle}
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
    paddingTop: 8,
    paddingBottom: 28,
    overflow: "hidden",
    minHeight: 112,
  },
  mandalaWrap: {
    position: "absolute",
    left: -40,
    top: -24,
    zIndex: 0,
  },
  templeWrap: {
    position: "absolute",
    right: -6,
    bottom: 14,
    zIndex: 1,
  },
  flagWrap: {
    position: "absolute",
    right: 96,
    bottom: 36,
    zIndex: 2,
  },
  flag: {
    width: 26,
    height: 40,
    opacity: 0.88,
    backgroundColor: "transparent",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    zIndex: 4,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backSpacer: {
    width: 40,
    height: 40,
  },
  topRight: {
    alignItems: "flex-end",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 3,
    marginTop: 8,
    paddingRight: 72,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: INK,
    fontSize: 26,
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  context: {
    color: INK,
    fontSize: 13,
    opacity: 0.88,
  },
  subtitle: {
    color: GOLD,
    fontSize: 13,
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
