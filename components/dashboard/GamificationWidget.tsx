import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Activity, Check, Flame, Trophy } from "lucide-react-native";

import {
  MetaLabel,
  Pill,
  RowGlyph,
  Section,
  useSurfaces,
  withAlpha,
} from "@/components/dashboard/primitives";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { useGamification } from "@/hooks/useGamification";
import { BADGES } from "@/shared/types/stats";
import { useTheme } from "@/theme/ThemeProvider";

export interface GamificationWidgetProps {
  streak?: number;
  budgetHealthScore?: number;
}

const BADGE_ICONS: Record<string, typeof Trophy> = {
  no_spend: Trophy,
  streak_7: Flame,
  saver_pro: Trophy,
};

/**
 * Financial Health (SPENDLY-533): level and XP toward the next level, the
 * logging streak, then the badges as quiet chips. Values come straight from
 * `useGamification`; nothing here scores or awards anything.
 */
export const GamificationWidget = memo(function GamificationWidget({
  streak = 0,
  budgetHealthScore = 85,
}: GamificationWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { stats, levelInfo } = useGamification();

  // budgetHealthScore kept for API parity / future health rings
  void budgetHealthScore;

  const currentStreak = stats?.currentStreak ?? streak ?? 0;

  return (
    <Section
      title="Financial Health"
      subtitle={levelInfo.title}
      icon={<Activity size={16} color={theme.colors.success} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.success)}
      badge={<Pill label={`Level ${levelInfo.level}`} tone="positive" />}
    >
      <View style={styles.body}>
        {/* XP meter — value first, meter second, target third. */}
        <ProgressIndicator
          pct={levelInfo.progress}
          status="good"
          leading={
            <Text
              style={[styles.xpValue, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
              numberOfLines={1}
            >
              {levelInfo.points.toLocaleString()}
              <Text
                style={[styles.xpUnit, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
              >
                {" "}
                XP
              </Text>
            </Text>
          }
          value={<MetaLabel>Next level {levelInfo.nextThreshold.toLocaleString()}</MetaLabel>}
          trailing={`${levelInfo.progress}% to level ${levelInfo.level + 1}`}
          accessibilityLabel={`${levelInfo.points} XP, ${levelInfo.progress}% of the way to level ${levelInfo.level + 1}`}
        />

        <View style={[styles.streakRow, { backgroundColor: surfaces.tile }]}>
          <RowGlyph size={34} tint={surfaces.wash(theme.colors.success)}>
            <Flame size={16} color={theme.colors.success} strokeWidth={2.3} />
          </RowGlyph>
          <View style={styles.streakText}>
            <MetaLabel>Logging streak</MetaLabel>
            <MetaLabel numberOfLines={2}>Am I building good habits?</MetaLabel>
          </View>
          <Text
            style={[styles.streakValue, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
          >
            {currentStreak} {currentStreak === 1 ? "day" : "days"}
          </Text>
        </View>

        {/* Badges kept, but muted to metadata weight rather than game trophies. */}
        <View style={styles.badgesRow}>
          {Object.values(BADGES).map((b) => {
            const earned = stats?.badges?.includes(b.id) ?? false;
            const BadgeIcon = BADGE_ICONS[b.id] ?? Trophy;
            return (
              <View
                key={b.id}
                style={[
                  styles.badge,
                  earned
                    ? {
                        backgroundColor: withAlpha(theme.colors.success, surfaces.isDark ? 0.14 : 0.09),
                        borderColor: withAlpha(theme.colors.success, surfaces.isDark ? 0.32 : 0.24),
                      }
                    : { backgroundColor: surfaces.tile, borderColor: theme.colors.border },
                ]}
                accessible
                accessibilityLabel={`${b.name}, ${earned ? "earned" : "not earned yet"}`}
              >
                <BadgeIcon
                  size={12}
                  color={earned ? theme.colors.success : theme.colors.mutedForeground}
                  strokeWidth={2.2}
                />
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: earned ? theme.colors.foreground : theme.colors.mutedForeground,
                      fontFamily: theme.fontFamily.medium,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {b.name}
                </Text>
                {/* Earned state in a mark, not colour alone. */}
                {earned ? <Check size={11} color={theme.colors.success} strokeWidth={2.8} /> : null}
              </View>
            );
          })}
        </View>
      </View>
    </Section>
  );
});

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  xpValue: {
    fontSize: 22,
    letterSpacing: -0.6,
  },
  xpUnit: {
    fontSize: 13,
    letterSpacing: 0,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  streakText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  streakValue: {
    fontSize: 16,
    letterSpacing: -0.3,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
  },
  badgeText: {
    fontSize: 11.5,
    flexShrink: 1,
  },
});
