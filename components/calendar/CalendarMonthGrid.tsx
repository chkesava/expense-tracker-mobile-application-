import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CalendarDayCell } from "@/shared/utils/calendarMonth";
import { withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Month grid for the Financial Calendar (SPENDLY-179). Plain views, no
 * calendar library. Money out is a filled dot, money in a ring, other events
 * a square, overdue a "!" — shapes, not just colours — and every day carries
 * a full screen-reader sentence.
 */
export const CalendarMonthGrid = memo(function CalendarMonthGrid({
  weekdays,
  weeks,
  onSelect,
}: {
  weekdays: string[];
  weeks: CalendarDayCell[][];
  onSelect: (date: string) => void;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.mutedForeground;

  return (
    <View style={{ gap: 2 }}>
      <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {weekdays.map((w) => (
          <Text key={w} style={[styles.weekday, { color: muted, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.xs }]}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].date} style={styles.row}>
          {week.map((c) => {
            const fg = c.isSelected ? theme.colors.primaryForeground : c.inMonth ? theme.colors.foreground : muted;
            return (
              <Pressable
                key={c.date}
                onPress={() => onSelect(c.date)}
                accessibilityRole="button"
                accessibilityLabel={c.accessibilityLabel}
                accessibilityState={{ selected: c.isSelected }}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    borderRadius: theme.radius.md,
                    backgroundColor: c.isSelected ? theme.colors.primary : pressed ? withAlpha(theme.colors.primary, 0.08) : "transparent",
                    borderWidth: c.isToday && !c.isSelected ? 1.5 : 0,
                    borderColor: theme.colors.primary,
                    opacity: c.inMonth ? 1 : 0.55,
                  },
                ]}
              >
                <Text style={{ color: fg, fontFamily: c.isToday ? theme.fontFamily.bold : theme.fontFamily.regular, fontSize: theme.typography.sm }}>{c.day}</Text>
                <View style={styles.marks}>
                  {c.outCount ? <View style={[styles.dot, { backgroundColor: c.isSelected ? fg : theme.colors.destructive }]} /> : null}
                  {c.inCount ? <View style={[styles.ring, { borderColor: c.isSelected ? fg : theme.colors.primary }]} /> : null}
                  {c.otherCount ? <View style={[styles.square, { backgroundColor: c.isSelected ? fg : muted }]} /> : null}
                  {c.overdue ? <Text style={{ color: c.isSelected ? fg : theme.colors.destructive, fontSize: 9, fontFamily: theme.fontFamily.bold }}>!</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

/** The key under the grid, so the marks are explained in words. */
export function CalendarLegend() {
  const { theme } = useTheme();
  const text = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  return (
    <View style={[styles.legend, { gap: theme.space.md }]} accessible accessibilityLabel="Key: filled dot is money out, ring is money in, square is other events, exclamation mark is overdue">
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: theme.colors.destructive }]} />
        <Text style={text}>Money out</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.ring, { borderColor: theme.colors.primary }]} />
        <Text style={text}>Money in</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.square, { backgroundColor: theme.colors.mutedForeground }]} />
        <Text style={text}>Other</Text>
      </View>
      <View style={styles.legendItem}>
        <Text style={[text, { color: theme.colors.destructive, fontFamily: theme.fontFamily.bold }]}>!</Text>
        <Text style={text}>Overdue</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", paddingVertical: 4 },
  cell: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3, margin: 1 },
  marks: { flexDirection: "row", alignItems: "center", gap: 3, minHeight: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  ring: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
  square: { width: 6, height: 6, borderRadius: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
});
