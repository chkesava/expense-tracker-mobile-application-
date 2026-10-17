import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarClock, ChevronRight, Hourglass } from "lucide-react-native";

import { DataRow, MetaLabel, Section, useSurfaces } from "@/components/dashboard/primitives";
import { Chip } from "@/components/ui/Chip";
import type { CalendarEvent } from "@/shared/types/calendar";
import { SUMMARY_WINDOW_LABELS, type CalendarCashSummary, type SummaryWindow } from "@/shared/utils/calendarSummary";
import { useTheme } from "@/theme/ThemeProvider";

export type SummaryLine = "expectedIn" | "commitments" | "overdue";

/**
 * Upcoming commitments and projected cash (SPENDLY-182). "Counted money today"
 * is labelled actual; everything else is labelled forecast, and each line
 * opens the events behind it.
 *
 * SPENDLY-545: on the shared `Section`/`DataRow`, with outline window chips.
 * `format` is ghost-aware, so every figure and label masks in ghost mode.
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
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const figure = (value: string, color = theme.colors.foreground) => (
    <Text numberOfLines={1} style={{ color, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, fontVariant: ["tabular-nums"] }}>
      {value}
    </Text>
  );
  const chevron = (shown: boolean) => (shown ? <ChevronRight size={14} color={theme.colors.mutedForeground} /> : <View style={{ width: 14 }} />);

  const line = (key: SummaryLine, title: string, sign: "+" | "−", total: number, count: number, events: CalendarEvent[]) => (
    <DataRow
      key={key}
      divider
      title={title}
      meta={`Forecast · ${count} event${count === 1 ? "" : "s"}`}
      value={figure(`${sign}${format(total)}`, sign === "+" && total > 0 ? theme.colors.success : theme.colors.foreground)}
      valueMeta={chevron(count > 0)}
      onPress={count ? () => onOpenLine(key, title, events) : undefined}
      accessibilityLabel={`${title}, forecast, ${sign === "+" ? "plus" : "minus"} ${format(total)}, from ${count} event${count === 1 ? "" : "s"}${count ? ". Shows the events" : ""}`}
    />
  );
  const negative = summary.projectedRemaining < 0;

  return (
    <Section title="Upcoming commitments" subtitle="Actual money today and what's forecast" icon={<CalendarClock size={16} color={theme.colors.primary} />} iconTint={surfaces.wash(theme.colors.primary)}>
      <View style={styles.chips}>
        {(Object.keys(SUMMARY_WINDOW_LABELS) as SummaryWindow[]).map((value) => (
          <Chip
            key={value}
            label={SUMMARY_WINDOW_LABELS[value]}
            selected={window === value}
            appearance="outline"
            accessibilityRole="tab"
            haptic={window !== value}
            onPress={() => onWindowChange(value)}
          />
        ))}
      </View>

      <DataRow
        divider
        title="Counted money today"
        meta="Actual · bank, cash and wallet you count"
        value={figure(format(summary.counted))}
        valueMeta={chevron(true)}
        onPress={onOpenSources}
        accessibilityLabel={`Counted money today, actual, ${format(summary.counted)}. Opens runway sources`}
      />
      {line("expectedIn", "Expected money in", "+", summary.expectedIn.total, summary.expectedIn.events.length, summary.expectedIn.events)}
      {line("commitments", "Upcoming commitments", "−", summary.commitments.total, summary.commitments.events.length, summary.commitments.events)}
      {summary.overdue.events.length ? line("overdue", "Overdue, still owed", "−", summary.overdue.total, summary.overdue.events.length, summary.overdue.events) : null}

      <View
        style={[styles.projected, { backgroundColor: negative ? surfaces.wash(theme.colors.destructive) : surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.md }]}
        accessible
        accessibilityLabel={`Projected remaining, a forecast and not a confirmed balance: ${format(summary.projectedRemaining)}`}
      >
        <MetaLabel>Forecast — not a confirmed balance</MetaLabel>
        <View style={styles.row}>
          <Text style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>Projected remaining</Text>
          <Text
            numberOfLines={1}
            style={{ color: negative ? theme.colors.destructive : theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.lg, fontVariant: ["tabular-nums"] }}
          >
            {format(summary.projectedRemaining)}
          </Text>
        </View>
      </View>

      <View style={{ gap: 4, marginTop: theme.space.sm }}>
        {summary.withoutAmount.length ? (
          <Text style={muted}>
            {summary.withoutAmount.length} upcoming item{summary.withoutAmount.length === 1 ? " has" : "s have"} no amount and {summary.withoutAmount.length === 1 ? "isn't" : "aren't"} included.
          </Text>
        ) : null}
        <Text style={muted}>Recorded income is already in your counted money. Everyday spending isn't included here.</Text>
      </View>
      <Pressable onPress={onOpenRunway} accessibilityRole="link" style={[styles.row, { gap: 6, minHeight: 40 }]}>
        <Hourglass size={14} color={theme.colors.primary} />
        <Text style={[muted, { flex: 1, color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>Full projection with everyday spending → Financial runway</Text>
      </Pressable>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  projected: { gap: 4, marginTop: 12 },
});
