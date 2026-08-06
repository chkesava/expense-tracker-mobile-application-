import { StyleSheet, Text, View } from "react-native";
import { Award, Flame, Shield, Sparkles, Trophy } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { useGamification } from "@/hooks/useGamification";
import { BADGES } from "@/shared/types/stats";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface GamificationWidgetProps {
  streak?: number;
  budgetHealthScore?: number;
}

export function GamificationWidget({
  streak = 1,
  budgetHealthScore = 85,
}: GamificationWidgetProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { stats, levelInfo } = useGamification();

  const currentStreak = stats?.currentStreak ?? streak;
  const shields = stats?.shields ?? 1;

  return (
    <Card
      title="Financial Health & Level"
      subtitle={`Level ${levelInfo.level} • ${levelInfo.title}`}
    >
      <View style={styles.container}>
        {/* Level XP Progress */}
        <View style={styles.xpRow}>
          <View style={styles.xpInfo}>
            <Text style={[styles.xpText, { color: theme.colors.foreground }]}>
              {levelInfo.points} XP
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              Next Level: {levelInfo.nextThreshold} XP
            </Text>
          </View>

          <View
            style={[
              styles.progressBarBg,
              { backgroundColor: theme.colors.muted },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${levelInfo.progress}%`,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
          </View>
        </View>

        {/* 2-Column Streak & Shield Stats */}
        <View style={styles.grid}>
          {/* Logging Streak */}
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: isDark
                  ? "rgba(249, 115, 22, 0.12)"
                  : "rgba(249, 115, 22, 0.08)",
                borderColor: "rgba(249, 115, 22, 0.25)",
              },
            ]}
          >
            <View style={styles.iconRow}>
              <Flame size={16} color="#F97316" />
              <Text style={[styles.boxLabel, { color: "#F97316" }]}>
                LOGGING STREAK
              </Text>
            </View>
            <Text
              style={[
                styles.boxValue,
                { color: theme.colors.foreground, fontSize: theme.typography.lg },
              ]}
            >
              {currentStreak} {currentStreak === 1 ? "day" : "days"}
            </Text>
            <Text style={{ fontSize: 10, color: theme.colors.mutedForeground }}>
              Keep tracking daily!
            </Text>
          </View>

          {/* No-Spend Shields */}
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: isDark
                  ? "rgba(34, 197, 94, 0.12)"
                  : "rgba(34, 197, 94, 0.08)",
                borderColor: "rgba(34, 197, 94, 0.25)",
              },
            ]}
          >
            <View style={styles.iconRow}>
              <Shield size={16} color="#22C55E" />
              <Text style={[styles.boxLabel, { color: "#22C55E" }]}>
                NO-SPEND SHIELDS
              </Text>
            </View>
            <Text
              style={[
                styles.boxValue,
                { color: theme.colors.foreground, fontSize: theme.typography.lg },
              ]}
            >
              {shields} {shields === 1 ? "shield" : "shields"}
            </Text>
            <Text style={{ fontSize: 10, color: theme.colors.mutedForeground }}>
              Zero-spend days saved
            </Text>
          </View>
        </View>

        {/* Badges Tray */}
        <View style={styles.badgesSection}>
          <Text style={[styles.badgesTitle, { color: theme.colors.mutedForeground }]}>
            EARNED BADGES
          </Text>
          <View style={styles.badgesRow}>
            {Object.values(BADGES).map((b) => {
              const hasBadge = stats?.badges?.includes(b.id) ?? true;
              return (
                <View
                  key={b.id}
                  style={[
                    styles.badgePill,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                      borderColor: theme.colors.border,
                      opacity: hasBadge ? 1 : 0.4,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{b.icon}</Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: theme.colors.foreground,
                    }}
                  >
                    {b.name}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  xpRow: {
    gap: 6,
  },
  xpInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  xpText: {
    fontSize: 13,
    fontWeight: "800",
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  grid: {
    flexDirection: "row",
    gap: 12,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  boxLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  boxValue: {
    fontWeight: "900",
  },
  badgesSection: {
    gap: 6,
    paddingTop: 6,
  },
  badgesTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
});
