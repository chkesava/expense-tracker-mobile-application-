import { StyleSheet, Text, View } from "react-native";
import {
  Flame,
  Shield,
  Trophy,
  Activity,
} from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { useGamification } from "@/hooks/useGamification";
import { BADGES } from "@/shared/types/stats";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface GamificationWidgetProps {
  streak?: number;
  budgetHealthScore?: number;
}

const BADGE_VISUAL: Record<
  string,
  { Icon: typeof Shield; color: string; bg: string }
> = {
  no_spend: {
    Icon: Shield,
    color: "#34D399",
    bg: "rgba(52, 211, 153, 0.16)",
  },
  streak_7: {
    Icon: Flame,
    color: "#F97316",
    bg: "rgba(249, 115, 22, 0.16)",
  },
  saver_pro: {
    Icon: Trophy,
    color: "#A855F7",
    bg: "rgba(168, 85, 247, 0.16)",
  },
};

export function GamificationWidget({
  streak = 1,
  budgetHealthScore = 85,
}: GamificationWidgetProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { stats, levelInfo } = useGamification();

  // budgetHealthScore kept for API parity / future health rings
  void budgetHealthScore;

  const currentStreak = stats?.currentStreak ?? streak;
  const shields = stats?.shields ?? 0;

  return (
    <Card
      title="Financial Health & Level"
      subtitle="Track streaks, shields, and XP"
      icon={
        <View
          style={[
            styles.headerIcon,
            {
              backgroundColor: isDark
                ? "rgba(52, 211, 153, 0.18)"
                : "rgba(34, 197, 94, 0.12)",
            },
          ]}
        >
          <Activity size={16} color="#34D399" />
        </View>
      }
      badge={
        <View
          style={[
            styles.levelPill,
            {
              backgroundColor: isDark
                ? "rgba(52, 211, 153, 0.16)"
                : "rgba(34, 197, 94, 0.12)",
              borderColor: "rgba(52, 211, 153, 0.35)",
            },
          ]}
        >
          <Text style={styles.levelPillText}>Level {levelInfo.level}</Text>
        </View>
      }
      radius="xxl"
    >
      <View style={styles.container}>
        {/* XP Progress */}
        <View style={styles.xpRow}>
          <View style={styles.xpInfo}>
            <Text style={[styles.xpText, { color: theme.colors.foreground }]}>
              {levelInfo.points} XP
            </Text>
            <Text
              style={{ fontSize: 11, color: theme.colors.mutedForeground }}
              numberOfLines={1}
            >
              Next Level: {levelInfo.nextThreshold} XP
            </Text>
          </View>

          <View
            style={[
              styles.progressBarBg,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
              },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${levelInfo.progress}%`,
                  backgroundColor: "#34D399",
                  shadowColor: "#34D399",
                },
              ]}
            />
          </View>

          <Text
            style={[styles.levelTitle, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            {levelInfo.title}
          </Text>
        </View>

        {/* Streak & Shield Stats */}
        <View style={styles.grid}>
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: isDark
                  ? "rgba(52, 211, 153, 0.1)"
                  : "rgba(34, 197, 94, 0.08)",
                borderColor: "rgba(52, 211, 153, 0.22)",
              },
            ]}
          >
            <View style={styles.iconRow}>
              <View
                style={[
                  styles.miniIcon,
                  { backgroundColor: "rgba(52, 211, 153, 0.2)" },
                ]}
              >
                <Flame size={14} color="#34D399" />
              </View>
              <Text style={[styles.boxLabel, { color: "#34D399" }]}>
                Logging Streak
              </Text>
            </View>
            <Text
              style={[styles.boxValue, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {currentStreak} {currentStreak === 1 ? "day" : "days"}
            </Text>
            <Text
              style={{ fontSize: 10, color: theme.colors.mutedForeground }}
              numberOfLines={1}
            >
              Keep tracking daily!
            </Text>
          </View>

          <View
            style={[
              styles.statBox,
              {
                backgroundColor: isDark
                  ? "rgba(59, 130, 246, 0.12)"
                  : "rgba(59, 130, 246, 0.08)",
                borderColor: "rgba(59, 130, 246, 0.22)",
              },
            ]}
          >
            <View style={styles.iconRow}>
              <View
                style={[
                  styles.miniIcon,
                  { backgroundColor: "rgba(59, 130, 246, 0.2)" },
                ]}
              >
                <Shield size={14} color="#3B82F6" />
              </View>
              <Text style={[styles.boxLabel, { color: "#3B82F6" }]}>
                No-Spend Shields
              </Text>
            </View>
            <Text
              style={[styles.boxValue, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {shields} {shields === 1 ? "shield" : "shields"}
            </Text>
            <Text
              style={{ fontSize: 10, color: theme.colors.mutedForeground }}
              numberOfLines={1}
            >
              Zero-spend days saved
            </Text>
          </View>
        </View>

        {/* Badges */}
        <View style={styles.badgesSection}>
          <View style={styles.badgesHeader}>
            <Trophy size={12} color={theme.colors.mutedForeground} />
            <Text
              style={[
                styles.badgesTitle,
                { color: theme.colors.mutedForeground },
              ]}
            >
              EARNED BADGES
            </Text>
          </View>
          <View style={styles.badgesRow}>
            {Object.values(BADGES).map((b) => {
              const hasBadge = stats?.badges?.includes(b.id) ?? false;
              const visual = BADGE_VISUAL[b.id] || BADGE_VISUAL.no_spend;
              const BadgeIcon = visual.Icon;
              return (
                <View
                  key={b.id}
                  style={[
                    styles.badgePill,
                    {
                      backgroundColor: hasBadge
                        ? visual.bg
                        : isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.03)",
                      borderColor: hasBadge
                        ? `${visual.color}55`
                        : theme.colors.border,
                      opacity: hasBadge ? 1 : 0.45,
                    },
                  ]}
                >
                  <BadgeIcon
                    size={12}
                    color={hasBadge ? visual.color : theme.colors.mutedForeground}
                  />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: hasBadge
                        ? theme.colors.foreground
                        : theme.colors.mutedForeground,
                    }}
                    numberOfLines={1}
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
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  levelPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#34D399",
  },
  container: {
    gap: 14,
  },
  xpRow: {
    gap: 8,
  },
  xpInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  xpText: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
  },
  levelTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    gap: 10,
  },
  statBox: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  miniIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  boxLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  boxValue: {
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  badgesSection: {
    gap: 8,
    paddingTop: 2,
  },
  badgesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgesTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
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
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: "100%",
  },
});
