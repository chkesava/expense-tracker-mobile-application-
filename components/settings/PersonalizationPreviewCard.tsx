/**
 * Interactive Live Preview Card for Personalization Settings.
 * Renders a miniature real-time interactive preview of theme, accent color, currency, and date formats.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Shield } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import { useTranslation } from "@/providers/LocalizationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { ACCENT_PALETTES } from "@/theme/tokens";

export function PersonalizationPreviewCard() {
  const { theme, themeName, themeMode, accentColor } = useTheme();
  const { settings } = useSettings();
  const { t } = useTranslation();

  const palette = ACCENT_PALETTES[accentColor] || ACCENT_PALETTES.indigo;

  const formatDatePreview = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    switch (settings.dateFormat) {
      case "DD/MM/YYYY":
        return `${day}/${month}/${year}`;
      case "MM/DD/YYYY":
        return `${month}/${day}/${year}`;
      case "DD MMM YYYY":
        return `${day} ${monthNames[now.getMonth()]} ${year}`;
      case "YYYY-MM-DD":
      default:
        return `${year}-${month}-${day}`;
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          ...theme.elevation[2],
        },
      ]}
    >
      {/* Header bar */}
      <View style={styles.headerRow}>
        <View style={styles.badgeContainer}>
          <View
            style={[
              styles.colorDot,
              { backgroundColor: theme.colors.primary },
            ]}
          />
          <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
            {palette.label} · {theme.name.toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.dateText, { color: theme.colors.mutedForeground }]}>
          {formatDatePreview()}
        </Text>
      </View>

      {/* Main preview body */}
      <View
        style={[
          styles.cardBody,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.balanceRow}>
          <View style={{ gap: 2 }}>
            <Text
              style={[
                styles.balanceLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              {t("balance_available", "Available Balance")}
            </Text>
            <Amount
              value={48500}
              currency={settings.currency}
              style={{
                fontSize: theme.typography.xl,
                fontWeight: "700",
                color: theme.colors.foreground,
              }}
            />
          </View>
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: theme.colors.primaryContainer,
              },
            ]}
          >
            <Shield size={18} color={theme.colors.primary} />
          </View>
        </View>

        {/* Budget progress bar preview */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text
              style={[
                styles.progressLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              {t("monthly_budget", "Monthly Budget")} (68%)
            </Text>
            <Amount
              value={24500}
              currency={settings.currency}
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
              }}
            />
          </View>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.colors.primary,
                  width: "68%",
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Action button preview */}
      <View style={styles.footerRow}>
        <Button
          size="sm"
          onPress={() => {
            void haptic.selection();
          }}
          style={{ flex: 1 }}
        >
          {t("preview_sample_button", "Interactive Accent Button")}
        </Button>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardBody: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
  },
});
