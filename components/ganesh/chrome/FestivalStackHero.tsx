import { type ReactNode } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

const MARK_BG = "#FFF8F1";
const INK = "#FFF8F1";
const GOLD = "#E8C36A";

/**
 * Maroon festival chrome for standalone Ganesh screens (Admin, Setup, login).
 * Same family as the tab heroes — not a second design system.
 */
export function FestivalStackHero({
  title,
  subtitle,
  onBack,
  mark,
  rightAccessory,
  showFlag = true,
  showTemple = true,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  mark?: ReactNode;
  rightAccessory?: ReactNode;
  showFlag?: boolean;
  showTemple?: boolean;
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
          paddingTop: insets.top + 6,
          experimental_backgroundImage: g.isDark
            ? "linear-gradient(180deg, #4A1628 0%, #3A1020 88%)"
            : "linear-gradient(180deg, #9B2C4A 0%, #7A1836 62%, #64142C 100%)",
        },
      ]}
    >
      <View pointerEvents="none" style={styles.mandalaWrap}>
        <GaneshArt name="mandala" width={mandala * 0.82} height={mandala * 0.82} opacity={0.1} />
      </View>
      <FestivalGarlandBells />
      {showTemple ? (
        <View pointerEvents="none" style={styles.templeWrap}>
          <Image
            source={FESTIVAL_CHROME_ART.temple}
            resizeMode="contain"
            style={{ width: temple * 0.72, height: temple * 0.72, opacity: 0.5 }}
          />
        </View>
      ) : null}
      {showFlag ? (
        <View pointerEvents="none" style={styles.flagWrap}>
          <Image source={FESTIVAL_CHROME_ART.flag} resizeMode="contain" style={styles.flag} />
        </View>
      ) : null}

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
          <View style={styles.back} />
        )}
        {rightAccessory ? <View style={styles.topRight}>{rightAccessory}</View> : null}
      </View>

      <View style={styles.row}>
        {mark ? (
          <View style={styles.mark} accessibilityRole="image">
            {mark}
          </View>
        ) : null}
        <View style={styles.copy}>
          <Text
            style={[styles.title, { fontFamily: TITLE_FONT ?? theme.fontFamily.bold }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { fontFamily: theme.fontFamily.medium }]}
              numberOfLines={1}
            >
              ✿  {subtitle.toUpperCase()}  ✿
            </Text>
          ) : null}
        </View>
      </View>

      <View pointerEvents="none" style={[styles.curveBite, { backgroundColor: theme.colors.background }]} />
    </View>
  );
}

/**
 * Login identity. Ganesha is the mark — the geometric arch is retired here.
 */
export function FestivalAuthHero({
  title,
  tagline,
}: {
  title: string;
  tagline?: string;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const insets = useSafeAreaInsets();
  const { ganesha, mandala } = useArtScale();
  const maroon = g.isDark ? "#3A1020" : "#7A1836";

  return (
    <View
      style={[
        styles.authHero,
        {
          backgroundColor: maroon,
          paddingTop: insets.top + 10,
          experimental_backgroundImage: g.isDark
            ? "linear-gradient(180deg, #4A1628 0%, #3A1020 88%)"
            : "linear-gradient(180deg, #9B2C4A 0%, #7A1836 62%, #64142C 100%)",
        },
      ]}
    >
      <View pointerEvents="none" style={styles.mandalaWrap}>
        <GaneshArt name="mandala" width={mandala} height={mandala} opacity={0.12} />
      </View>
      <FestivalGarlandBells />
      <View pointerEvents="none" style={styles.authFlagWrap}>
        <Image source={FESTIVAL_CHROME_ART.flag} resizeMode="contain" style={styles.authFlag} />
      </View>

      <View style={styles.authIdentity}>
        <View
          style={[
            styles.ganeshaRing,
            {
              width: ganesha,
              height: ganesha,
              borderRadius: ganesha / 2,
              borderColor: GOLD,
            },
          ]}
          accessibilityRole="image"
          accessibilityLabel="Ganesha"
        >
          <GaneshArt name="ganesha" width={ganesha} height={ganesha} resizeMode="cover" />
        </View>
        <View style={styles.authCopy}>
          <Text
            style={[styles.authTitle, { fontFamily: TITLE_FONT ?? theme.fontFamily.bold }]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {tagline ? (
            <Text
              style={[styles.authTagline, { fontFamily: theme.fontFamily.medium }]}
              numberOfLines={3}
            >
              {tagline}
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
    paddingBottom: 30,
    overflow: "hidden",
    minHeight: 128,
  },
  authHero: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    overflow: "hidden",
    minHeight: 168,
  },
  mandalaWrap: {
    position: "absolute",
    left: -48,
    top: -16,
    zIndex: 0,
  },
  templeWrap: {
    position: "absolute",
    right: -10,
    bottom: 8,
    zIndex: 1,
  },
  flagWrap: {
    position: "absolute",
    right: 92,
    bottom: 28,
    zIndex: 2,
  },
  flag: {
    width: 36,
    height: 54,
  },
  authFlagWrap: {
    position: "absolute",
    right: 10,
    bottom: 28,
    zIndex: 2,
  },
  authFlag: {
    width: 44,
    height: 66,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    zIndex: 4,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  topRight: {
    alignItems: "flex-end",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 3,
    marginTop: 4,
    paddingRight: 88,
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: MARK_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: INK,
    fontSize: 26,
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  subtitle: {
    color: GOLD,
    fontSize: 11.5,
    letterSpacing: 0.45,
  },
  authIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 3,
    marginTop: 10,
    paddingRight: 56,
  },
  ganeshaRing: {
    overflow: "hidden",
    borderWidth: 2.5,
    backgroundColor: "#1A0A10",
  },
  authCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  authTitle: {
    color: INK,
    fontSize: 30,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  authTagline: {
    color: "rgba(255, 248, 241, 0.88)",
    fontSize: 14,
    lineHeight: 20,
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
