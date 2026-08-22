import React, { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { insightSurface } from "@/components/analytics/insightsTheme";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type AnalyticsCardTone = "default" | "danger";

export interface AnalyticsCardProps {
  /** Uppercase card heading, e.g. "MONTHLY CASH FLOW". */
  title: string;
  /** Small accent glyph rendered left of the title. */
  icon?: ReactNode;
  /** Secondary line under the heading. */
  subtitle?: string;
  /** Trailing header slot — counts, thresholds, chevrons. */
  right?: ReactNode;
  tone?: AnalyticsCardTone;
  /** Vertical gap between the header and the body. */
  gap?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The single card shell every Insights analytics section is built from:
 * dark surface, hairline border, one restrained gradient wash, uppercase
 * heading with an optional accent glyph.
 */
export function AnalyticsCard({
  title,
  icon,
  subtitle,
  right,
  tone = "default",
  gap = 14,
  children,
  style,
}: AnalyticsCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const isDanger = tone === "danger";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: surface.card,
          borderColor: isDanger
            ? isDark
              ? "rgba(244, 63, 94, 0.32)"
              : "rgba(220, 38, 38, 0.22)"
            : surface.border,
        },
        style,
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          isDanger
            ? isDark
              ? ["rgba(244, 63, 94, 0.12)", "rgba(12, 17, 29, 0)", "#0A0D17"]
              : ["rgba(220, 38, 38, 0.06)", "rgba(255, 255, 255, 0)", "#FFF7F7"]
            : surface.wash
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.body, { gap }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
            <View style={styles.headerText}>
              <Text
                style={[
                  styles.title,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.bold,
                  },
                ]}
                numberOfLines={2}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
                  numberOfLines={2}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {right ? <View style={styles.headerRight}>{right}</View> : null}
        </View>

        {children}
      </View>
    </View>
  );
}

/** Muted trailing label for a card header (counts, thresholds). */
export function AnalyticsCardMeta({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text
      style={[styles.meta, { color: theme.colors.mutedForeground }]}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  body: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "500",
  },
  headerRight: {
    flexShrink: 0,
    maxWidth: "42%",
    alignItems: "flex-end",
  },
  meta: {
    fontSize: 11,
    fontWeight: "700",
  },
});
