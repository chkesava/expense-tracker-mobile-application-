import { StyleSheet, Text, View } from "react-native";
import { Activity, Flame, Shield, Trophy } from "lucide-react-native";

import {
  MetaLabel,
  Pill,
  ProgressTrack,
  Section,
  StatTile,
  useSurfaces,
  withAlpha,
} from "@/components/dashboard/primitives";
import { useGamification } from "@/hooks/useGamification";
import { BADGES } from "@/shared/types/stats";
import { useTheme } from "@/theme/ThemeProvider";

export interface GamificationWidgetProps {
  streak?: number;
  budgetHealthScore?: number;
}

const BADGE_ICONS: Record<string, typeof Shield> = {
  no_spend: Shield,
  streak_7: Flame,
  saver_pro: Trophy,
};

export function GamificationWidget({
  streak = 0,
  budgetHealthScore = 85,
}: GamificationWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { stats, levelInfo } = useGamification();

  // budgetHealthScore kept for API parity / future health rings
  void budgetHealthScore;

  const currentStreak = stats?.currentStreak ?? streak ?? 0;
  const shields = stats?.shields ?? 0;

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
        <View style={styles.xpBlock}>
          <View style={styles.xpRow}>
            <Text
              style={[
                styles.xpValue,
                {
                  color: theme.colors.foreground,
                  fontFamily: theme.fontFamily.bold,
                },
              ]}
            >
              {levelInfo.points.toLocaleString()}
              <Text
                style={[
                  styles.xpUnit,
                  {
                    color: theme.colors.mutedForeground,
                    fontFamily: theme.fontFamily.medium,
                  },
                ]}
              >
                {" "}
                XP
              </Text>
            </Text>
            <MetaLabel>Next level {levelInfo.nextThreshold.toLocaleString()}</MetaLabel>
          </View>
          <ProgressTrack
            pct={levelInfo.progress}
            color={theme.colors.success}
            height={6}
          />
        </View>

        <View style={styles.tiles}>
          <StatTile
            label="Logging streak"
            meta={<MetaLabel>Keep tracking daily</MetaLabel>}
          >
            <View style={styles.tileValueRow}>
              <Flame size={15} color={theme.colors.success} strokeWidth={2.3} />
              <Text
                style={[
                  styles.tileValue,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.semibold,
                  },
                ]}
                numberOfLines={1}
              >
                {currentStreak} {currentStreak === 1 ? "day" : "days"}
              </Text>
            </View>
          </StatTile>

          <StatTile
            label="No-spend shields"
            meta={<MetaLabel>Zero-spend days saved</MetaLabel>}
          >
            <View style={styles.tileValueRow}>
              <Shield size={15} color={theme.colors.info} strokeWidth={2.3} />
              <Text
                style={[
                  styles.tileValue,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.semibold,
                  },
                ]}
                numberOfLines={1}
              >
                {shields} {shields === 1 ? "shield" : "shields"}
              </Text>
            </View>
          </StatTile>
        </View>

        {/* Badges kept, but muted to metadata weight rather than game trophies. */}
        <View style={styles.badgesRow}>
          {Object.values(BADGES).map((b) => {
            const earned = stats?.badges?.includes(b.id) ?? false;
            const BadgeIcon = BADGE_ICONS[b.id] ?? Shield;
            const color = earned
              ? theme.colors.foreground
              : theme.colors.mutedForeground;
            return (
              <View
                key={b.id}
                style={[
                  styles.badge,
                  {
                    backgroundColor: earned
                      ? withAlpha(theme.colors.success, surfaces.isDark ? 0.14 : 0.09)
                      : surfaces.tile,
                  },
                ]}
              >
                <BadgeIcon
                  size={12}
                  color={earned ? theme.colors.success : theme.colors.mutedForeground}
                  strokeWidth={2.2}
                />
                <Text
                  style={[
                    styles.badgeText,
                    { color, fontFamily: theme.fontFamily.medium },
                  ]}
                  numberOfLines={1}
                >
                  {b.name}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  xpBlock: {
    gap: 8,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  xpValue: {
    fontSize: 24,
    letterSpacing: -0.7,
  },
  xpUnit: {
    fontSize: 13,
    letterSpacing: 0,
  },
  tiles: {
    flexDirection: "row",
    gap: 10,
  },
  tileValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tileValue: {
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
  },
  badgeText: {
    fontSize: 11.5,
  },
});
