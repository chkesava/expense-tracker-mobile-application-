import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { withAlpha } from "@/components/ganesh/ui";
import { haptic } from "@/lib/haptics";
import type { PrasadamEntry } from "@/shared/types/ganeshPrasadam";
import { entriesForSession, isPrasadamActive } from "@/shared/utils/ganeshPrasadam";
import { formatSevaDate } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The festival day strip, with coverage built into it.
 *
 * Geometry is the Seva tab's, deliberately copied rather than shared: that
 * strip shows one dot for "something is scheduled", and this one needs two —
 * left for the morning, right for the evening — so a committee can read the
 * whole festival's prasadam coverage at a glance without opening a single day.
 * Refactoring the Seva tab to accommodate a second dot would change a screen
 * this feature has no business changing.
 */
export function PrasadamDayStrip({
  dates,
  activeDate,
  today,
  entries,
  onSelect,
}: {
  dates: string[];
  activeDate: string;
  today: string;
  entries: readonly PrasadamEntry[];
  onSelect: (date: string) => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const coverage = useMemo(() => {
    const map = new Map<string, { morning: boolean; evening: boolean }>();
    for (const date of dates) {
      map.set(date, {
        morning: entriesForSession(entries, date, "morning").some(isPrasadamActive),
        evening: entriesForSession(entries, date, "evening").some(isPrasadamActive),
      });
    }
    return map;
  }, [dates, entries]);

  if (dates.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {dates.map((date) => {
        const active = date === activeDate;
        const isToday = date === today;
        const cover = coverage.get(date) ?? { morning: false, evening: false };
        const label = formatSevaDate(date, true);
        return (
          <Pressable
            key={date}
            onPress={() => {
              void haptic.selection();
              onSelect(date);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${label}, morning ${
              cover.morning ? "recorded" : "not recorded"
            }, evening ${cover.evening ? "recorded" : "not recorded"}`}
            hitSlop={4}
            style={[
              styles.day,
              {
                backgroundColor: active ? g.wash(g.saffron) : g.tile,
                // Gold as a hairline is the one sanctioned decorative use, and
                // it marks today when today is not the day being looked at.
                borderColor: active
                  ? g.saffron
                  : isToday
                    ? withAlpha(g.gold, 0.55)
                    : "transparent",
              },
            ]}
          >
            <Text
              style={[
                styles.dayWeek,
                {
                  color: active ? g.saffron : theme.colors.mutedForeground,
                  fontFamily: theme.fontFamily.medium,
                },
              ]}
            >
              {isToday ? "Today" : label.slice(0, 3)}
            </Text>
            <Text
              style={[
                styles.dayNum,
                {
                  color: active ? g.saffron : theme.colors.foreground,
                  fontFamily: theme.fontFamily.semibold,
                },
              ]}
            >
              {Number(date.slice(8, 10))}
            </Text>
            <View style={styles.dots}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: cover.morning ? g.saffron : "transparent",
                    borderColor: cover.morning ? g.saffron : g.divider,
                  },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: cover.evening ? g.maroon : "transparent",
                    borderColor: cover.evening ? g.maroon : g.divider,
                  },
                ]}
              />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  day: {
    width: 54,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
  },
  dayWeek: { fontSize: 11, letterSpacing: 0.3 },
  dayNum: { fontSize: 17, fontVariant: ["tabular-nums"] },
  dots: { flexDirection: "row", gap: 3, marginTop: 2, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
});
