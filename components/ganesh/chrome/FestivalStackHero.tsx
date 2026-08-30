import { type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { FestivalGarlandBells } from "@/components/ganesh/art/FestivalChrome";
import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useTheme } from "@/theme/ThemeProvider";

import { FestivalHero } from "./FestivalHero";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

const GOLD = "#E8C36A";

/**
 * Maroon festival chrome for standalone Ganesh screens (Admin, Setup).
 * Same family as the tab heroes — not a second design system.
 */
export function FestivalStackHero({
  title,
  subtitle,
  onBack,
  mark,
  rightAccessory,
  showFlag = false,
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
  return (
    <FestivalHero
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      rightAccessory={rightAccessory}
      showFlag={showFlag}
      showTemple={showTemple}
      mark={mark ? <GaneshIconTile onDark>{mark}</GaneshIconTile> : undefined}
    />
  );
}

/**
 * Login identity. Ganesha is the mark — decoration stays secondary.
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
  const { ganesha, mandala } = useArtScale();
  const maroon = g.isDark ? "#3A1020" : "#7A1836";

  return (
    <View
      style={[
        styles.authHero,
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
  authHero: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 36,
    overflow: "hidden",
    minHeight: 156,
  },
  mandalaWrap: {
    position: "absolute",
    left: -40,
    top: -20,
    zIndex: 0,
  },
  authIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 3,
    marginTop: 10,
    paddingRight: 16,
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
    color: "#FFF8F1",
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
