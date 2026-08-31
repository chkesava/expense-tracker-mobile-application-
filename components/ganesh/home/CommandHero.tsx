import { type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Bell } from "lucide-react-native";

import { FestivalSwitcher } from "@/components/ganesh/chrome/FestivalSwitcher";
import { ClosedFestivalBanner } from "@/components/ganesh/chrome/ClosedFestivalBanner";
import { FestivalDateStrip } from "@/components/ganesh/art/FestivalDateStrip";
import { FestivalGarlandBells } from "@/components/ganesh/art/FestivalChrome";
import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { withAlpha } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

/**
 * Full-bleed Home identity. Maroon is the hero surface; money never appears
 * here. Dates come from the festival record via `FestivalDateStrip`.
 */
export function CommandHero({
  pandalName,
  festivalName,
  festival,
  today,
  onNotify,
  onFestivalDates,
  rightAccessory,
}: {
  pandalName?: string;
  festivalName?: string;
  festival?: { startDate?: string; endDate?: string; name?: string } | null;
  today?: string;
  onNotify?: () => void;
  onFestivalDates?: () => void;
  rightAccessory?: ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { ganesha, mandala } = useArtScale();
  const maroon = g.isDark ? "#3A1020" : "#7A1836";
  const gold = "#E8C36A";

  return (
    <View style={styles.wrap}>
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
          <GaneshArt name="mandala" width={mandala} height={mandala} opacity={0.1} />
        </View>
        <FestivalGarlandBells />

        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <View style={styles.topActions}>
            <Pressable
              onPress={
                onNotify
                  ? () => {
                      void haptic.selection();
                      onNotify();
                    }
                  : undefined
              }
              disabled={!onNotify}
              accessibilityRole={onNotify ? "button" : "image"}
              accessibilityLabel={onNotify ? "Open admin" : "Notifications"}
              hitSlop={8}
              style={({ pressed }) => [styles.bellButton, pressed && onNotify ? { opacity: 0.75 } : null]}
            >
              <Bell size={20} color="#FFF8F1" strokeWidth={1.8} />
            </Pressable>
            {rightAccessory}
          </View>
        </View>

        <Text
          style={[styles.greeting, { color: gold, fontFamily: theme.fontFamily.medium }]}
          numberOfLines={1}
        >
          || गणपति बप्पा मोरया ||
        </Text>

        <View style={styles.identity}>
          <View
            style={[
              styles.medallion,
              {
                width: ganesha,
                height: ganesha,
                borderRadius: ganesha / 2,
                borderColor: gold,
                boxShadow: `0 0 16px ${withAlpha(gold, 0.45)}`,
              },
            ]}
          >
            <GaneshArt name="ganesha" width={ganesha} height={ganesha} resizeMode="cover" />
          </View>

          <View style={styles.copy}>
            <Text
              style={[
                styles.title,
                {
                  color: "#FFF8F1",
                  fontFamily: TITLE_FONT ?? theme.fontFamily.bold,
                },
              ]}
              numberOfLines={1}
            >
              Ganesh Seva
            </Text>
            <Text
              style={[styles.pandal, { color: withAlpha("#FFF8F1", 0.88), fontFamily: theme.fontFamily.medium }]}
              numberOfLines={2}
            >
              {pandalName || "Your Pandal"}
            </Text>
            {festivalName ? (
              <FestivalSwitcher variant="pill" fallbackName={festivalName} />
            ) : null}
          </View>
        </View>

        <View pointerEvents="none" style={[styles.curveBite, { backgroundColor: theme.colors.background }]} />
      </View>

      <ClosedFestivalBanner />
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
    paddingTop: 6,
    paddingBottom: 36,
    overflow: "hidden",
  },
  mandalaWrap: {
    position: "absolute",
    left: -48,
    top: -18,
    zIndex: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    zIndex: 3,
  },
  topBarSpacer: {
    flex: 1,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bellButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    textAlign: "center",
    fontSize: 13,
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 12,
    zIndex: 3,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 3,
  },
  medallion: {
    overflow: "hidden",
    borderWidth: 2.5,
    backgroundColor: "#0A0A0A",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 30,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  pandal: {
    fontSize: 14,
    lineHeight: 18,
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
