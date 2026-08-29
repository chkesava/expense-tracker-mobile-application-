import { type ReactNode } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, CalendarDays, ChevronRight, Sun } from "lucide-react-native";

import { GANESH_RADIUS, withAlpha } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { festivalWindowSummary } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

const GOD = require("@/assets/branding/ganesh/god.png");
const GARLAND = require("@/assets/branding/ganesh/garland-hang.png");

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

/**
 * Full-bleed Home identity. Maroon is the hero surface; money never appears
 * here. Dates come from the festival record via `festivalWindowSummary`.
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
  festival?: { startDate?: string; endDate?: string } | null;
  today?: string;
  onNotify?: () => void;
  onFestivalDates?: () => void;
  rightAccessory?: ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const insets = useSafeAreaInsets();
  const window = festivalWindowSummary(festival, today);
  const maroon = g.isDark ? "#3A1020" : "#7A1836";
  const gold = "#E8C36A";

  const dateLine = window.label
    ? [
        `Festival dates: ${window.label}`,
        window.year,
        window.totalDays != null
          ? `(${window.totalDays} Day${window.totalDays === 1 ? "" : "s"})`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : festivalName
      ? festivalName
      : "Festival dates will appear once the committee sets them.";

  return (
    <View style={styles.wrap}>
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
        <View pointerEvents="none" style={[styles.garland, styles.garlandLeft]}>
          <Image source={GARLAND} style={styles.garlandImage} resizeMode="contain" />
        </View>
        <View pointerEvents="none" style={[styles.garland, styles.garlandRight]}>
          <Image source={GARLAND} style={styles.garlandImage} resizeMode="contain" />
        </View>

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
          <View style={[styles.medallion, { borderColor: gold, boxShadow: `0 0 16px ${withAlpha(gold, 0.45)}` }]}>
            <Image source={GOD} style={styles.god} resizeMode="cover" />
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
              <View style={[styles.festivalPill, { backgroundColor: "#C2410C" }]}>
                <Sun size={11} color="#FFF8F1" strokeWidth={2.4} />
                <Text
                  style={[styles.festivalPillText, { color: "#FFF8F1", fontFamily: theme.fontFamily.semibold }]}
                  numberOfLines={1}
                >
                  {festivalName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View
          pointerEvents="none"
          style={[styles.curveBite, { backgroundColor: theme.colors.background }]}
        />
      </View>

      <Pressable
        onPress={
          onFestivalDates
            ? () => {
                void haptic.selection();
                onFestivalDates();
              }
            : undefined
        }
        disabled={!onFestivalDates}
        accessibilityRole={onFestivalDates ? "button" : "text"}
        accessibilityLabel={dateLine}
        style={({ pressed }) => [
          styles.strip,
          {
            backgroundColor: theme.colors.card,
            borderColor: withAlpha(g.gold, 0.45),
          },
          pressed && onFestivalDates ? { opacity: 0.88 } : null,
        ]}
      >
        <View style={[styles.stripIcon, { backgroundColor: g.wash(g.saffron) }]}>
          <CalendarDays size={16} color={g.saffron} strokeWidth={2.2} />
        </View>
        <Text
          style={[styles.stripTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
          numberOfLines={2}
        >
          {dateLine}
        </Text>
        <ChevronRight size={18} color={g.saffron} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 4,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    overflow: "hidden",
  },
  garland: {
    position: "absolute",
    top: -2,
    width: 118,
    height: 132,
    zIndex: 2,
  },
  garlandImage: {
    width: "100%",
    height: "100%",
  },
  garlandLeft: {
    left: -8,
  },
  garlandRight: {
    right: -8,
    transform: [{ scaleX: -1 }],
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
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: "hidden",
    borderWidth: 2.5,
    backgroundColor: "#0A0A0A",
  },
  god: {
    width: 92,
    height: 92,
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
  festivalPill: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  festivalPillText: {
    fontSize: 11.5,
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
  strip: {
    marginHorizontal: 16,
    marginTop: -10,
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 4,
  },
  stripIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  stripTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    lineHeight: 18,
  },
});
