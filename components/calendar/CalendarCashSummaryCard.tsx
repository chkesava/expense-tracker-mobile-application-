import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Hourglass } from "lucide-react-native";

import { ChipRow } from "@/components/settings/SettingsControls";
import type { CalendarEvent } from "@/shared/types/calendar";
import { SUMMARY_WINDOW_LABELS, type CalendarCashSummary, type SummaryWindow } from "@/shared/utils/calendarSummary";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export type SummaryLine = "expectedIn" | "commitments" | "overdue";

/**
 * Upcoming commitments and projected cash (SPENDLY-182). "Counted money today"
 * is labelled actual; everything else is labelled forecast, and each line
 * opens the events behind it.
 */
export function CalendarCashSummaryCard({
  summary,
  window,
  onWindowChange,
  format,
  onOpenLine,
  onOpenRunway,
  onOpenSources,
}: {
  summary: CalendarCashSummary;
  window: SummaryWindow;
  onWindowChange: (w: SummaryWindow) => void;
  format: (n: number) => string;
  onOpenLine: (line: SummaryLine, title: string, events: CalendarEvent[]) => void;
  onOpenRunway: () => void;
  onOpenSources: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const tag = (label: string) => <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>{label}</Text>;

  const line = (key: SummaryLine, title: string, sign: "+" | "−", total: number, count: number, events: CalendarEvent[]) => (
    <Pressable
      key={key}
      onPress={() => onOpenLine(key, title, events)}
      disabled={!count}
      accessibilityRole="button"
      accessibilityLabel={`${title}, forecast, ${sign === "+" ? "plus" : "minus"} ${format(total)}, from ${count} event${count === 1 ? "" : "s"}${count ? ". Shows the events" : ""}`}
      style={[styles.row, { minHeight: 44 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={text}>{title}</Text>
        <Text style={muted}>
          Forecast · {count} event{count === 1 ? "" : "s"}
        </Text>
      </View>
      <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>
        {sign}
        {format(total)}
      </Text>
      {count ? <ChevronRight size={14} color={theme.colors.mutedForeground} /> : <View style={{ width: 14 }} />}
    </Pressable>
  );

  return (
    <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.md, gap: theme.space.sm, backgroundColor: theme.colors.card }}>
      <Text style={[text, { fontFamily: theme.fontFamily.semibold }]} accessibilityRole="header">
        Upcoming commitments
      </Text>
      <ChipRow<SummaryWindow>
        options={(Object.keys(SUMMARY_WINDOW_LABELS) as SummaryWindow[]).map((value) => ({ value, label: SUMMARY_WINDOW_LABELS[value] }))}
        selected={window}
        onSelect={onWindowChange}
      />

      <Pressable onPress={onOpenSources} accessibilityRole="button" accessibilityLabel={`Counted money today, actual, ${format(summary.counted)}. Opens runway sources`} style={[styles.row, { minHeight: 44 }]}>
        <View style={{ flex: 1 }}>
          <Text style={text}>Counted money today</Text>
          {tag("Actual · bank, cash and wallet you count")}
        </View>
        <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{format(summary.counted)}</Text>
        <ChevronRight size={14} color={theme.colors.mutedForeground} />
      </Pressable>
      {line("expectedIn", "Expected money in", "+", summary.expectedIn.total, summary.expectedIn.events.length, summary.expectedIn.events)}
      {line("commitments", "Upcoming commitments", "−", summary.commitments.total, summary.commitments.events.length, summary.commitments.events)}
      {summary.overdue.events.length ? line("overdue", "Overdue, still owed", "−", summary.overdue.total, summary.overdue.events.length, summary.overdue.events) : null}

      <View
        style={{ backgroundColor: surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.md, gap: 2 }}
        accessible
        accessibilityLabel={`Projected remaining, a forecast and not a confirmed balance: ${format(summary.projectedRemaining)}`}
      >
        {tag("FORECAST — NOT A CONFIRMED BALANCE")}
        <View style={styles.row}>
          <Text style={[text, { flex: 1 }]}>Projected remaining</Text>
          <Text style={{ color: summary.projectedRemaining < 0 ? theme.colors.destructive : theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.md }}>
            {format(summary.projectedRemaining)}
          </Text>
        </View>
      </View>
      {summary.withoutAmount.length ? (
        <Text style={muted}>
          {summary.withoutAmount.length} upcoming item{summary.withoutAmount.length === 1 ? " has" : "s have"} no amount and {summary.withoutAmount.length === 1 ? "isn't" : "aren't"} included.
        </Text>
      ) : null}
      <Text style={muted}>Recorded income is already in your counted money. Everyday spending isn't included here.</Text>
      <Pressable onPress={onOpenRunway} accessibilityRole="link" style={[styles.row, { gap: 6, minHeight: 36 }]}>
        <Hourglass size={14} color={theme.colors.primary} />
        <Text style={[muted, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>Full projection with everyday spending → Financial runway</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
