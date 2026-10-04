import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CircleDot, ChevronRight } from "lucide-react-native";

import type { CalendarEvent } from "@/shared/types/calendar";
import { CALENDAR_SOURCE_LABELS, CALENDAR_STATE_LABELS, eventAccessibilityLabel } from "@/shared/utils/calendarMonth";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One calendar event (SPENDLY-179/180): title, source, state in words, and the
 * amount with a direction icon. Used by the selected-day list and the agenda.
 */
export const CalendarEventRow = memo(function CalendarEventRow({
  event,
  format,
  onPress,
}: {
  event: CalendarEvent;
  format: (n: number) => string;
  onPress: (event: CalendarEvent) => void;
}) {
  const { theme } = useTheme();
  const overdue = event.state === "overdue";
  const done = event.state === "completed" || event.state === "cancelled";
  const Icon = overdue ? AlertTriangle : event.direction === "in" ? ArrowDownLeft : event.direction === "out" ? ArrowUpRight : CircleDot;
  const iconColor = overdue ? theme.colors.destructive : event.direction === "in" ? theme.colors.primary : theme.colors.mutedForeground;
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  return (
    <Pressable
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={eventAccessibilityLabel(event, format)}
      accessibilityHint="Shows details and actions"
      style={({ pressed }) => [styles.row, { gap: theme.space.md, paddingVertical: theme.space.sm, opacity: pressed ? 0.7 : done ? 0.75 : 1 }]}
    >
      <Icon size={18} color={iconColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
          {event.title}
        </Text>
        <Text numberOfLines={1} style={[muted, overdue ? { color: theme.colors.destructive, fontFamily: theme.fontFamily.semibold } : null]}>
          {CALENDAR_STATE_LABELS[event.state]} · {CALENDAR_SOURCE_LABELS[event.source]}
          {event.subtitle ? ` · ${event.subtitle}` : ""}
        </Text>
      </View>
      {event.amount !== null ? (
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
          {event.direction === "in" ? "+" : event.direction === "out" ? "−" : ""}
          {format(event.amount)}
        </Text>
      ) : null}
      <ChevronRight size={14} color={theme.colors.mutedForeground} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 52 },
});
