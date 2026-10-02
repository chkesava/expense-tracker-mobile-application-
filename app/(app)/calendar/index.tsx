import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";

import { CalendarEventRow } from "@/components/calendar/CalendarEventRow";
import { CalendarLegend, CalendarMonthGrid } from "@/components/calendar/CalendarMonthGrid";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { useFinancialCalendar } from "@/hooks/useFinancialCalendar";
import { useSettings } from "@/providers/SettingsProvider";
import type { CalendarEvent } from "@/shared/types/calendar";
import { CALENDAR_SOURCE_LABELS, buildMonthGrid, dayTotals, longDateLabel, monthTitle, nextMonth, previousMonth } from "@/shared/utils/calendarMonth";
import { monthGridRange } from "@/shared/utils/calendarQuery";
import { todayDateKey } from "@/shared/utils/dates";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Financial Calendar month view (SPENDLY-179): one place to see what happens
 * financially on each day. Read-only — every event comes from its canonical
 * record and opens that record.
 */
export default function FinancialCalendarScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const { settings } = useSettings();
  const bottomPadding = usePageListBottomPadding();
  const today = todayDateKey(settings.timezone);
  const firstDay = settings.firstDayOfWeek;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [showEarlier, setShowEarlier] = useState(false);

  const range = useMemo(() => monthGridRange(month, firstDay), [month, firstDay]);
  const cal = useFinancialCalendar(range);
  const fmt = useCallback((n: number) => formatAmount(n, cal.currency), [cal.currency]);
  const grid = useMemo(() => buildMonthGrid(month, firstDay, cal.byDate, today, selected), [month, firstDay, cal.byDate, today, selected]);
  const dayEvents = cal.byDate.get(selected) ?? [];
  const totals = dayTotals(dayEvents);

  const go = (m: string) => {
    setMonth(m);
    setSelected(m === today.slice(0, 7) ? today : `${m}-01`);
  };
  const open = useCallback((e: CalendarEvent) => router.push(e.href as Href), [router]);

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const h2 = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };
  const card = { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.md, backgroundColor: theme.colors.card };

  const header = (
    <PageHeader
      title="Financial calendar"
      subtitle="Bills, income and commitments by date"
      icon={<CalendarDays size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href))}
    />
  );

  let body;
  if (cal.loadState === "error") {
    body = <ErrorState title="Couldn't load your calendar" description="None of your financial data could be read. Check your connection and try again." />;
  } else {
    body = (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.md }}>
        <View style={styles.navRow}>
          <Pressable onPress={() => go(previousMonth(month))} accessibilityRole="button" accessibilityLabel={`Previous month, ${monthTitle(previousMonth(month))}`} hitSlop={8} style={styles.navBtn}>
            <ChevronLeft size={22} color={theme.colors.foreground} />
          </Pressable>
          <Text style={[h2, { flex: 1, textAlign: "center" }]} accessibilityRole="header">
            {monthTitle(month)}
          </Text>
          <Pressable onPress={() => go(nextMonth(month))} accessibilityRole="button" accessibilityLabel={`Next month, ${monthTitle(nextMonth(month))}`} hitSlop={8} style={styles.navBtn}>
            <ChevronRight size={22} color={theme.colors.foreground} />
          </Pressable>
          <Pressable
            onPress={() => go(today.slice(0, 7))}
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            style={[styles.todayBtn, { borderColor: theme.colors.border, borderRadius: theme.radius.md }]}
          >
            <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>Today</Text>
          </Pressable>
        </View>

        {cal.loadState === "loading" && cal.events.length === 0 ? <LoadingState variant="list" count={3} /> : null}

        <CalendarMonthGrid weekdays={grid.weekdays} weeks={grid.weeks} onSelect={setSelected} />
        <CalendarLegend />

        {cal.loadState === "partial" ? (
          <Text style={muted} accessibilityLiveRegion="polite">
            {cal.failedSources.length
              ? `Some items couldn't load: ${cal.failedSources.map((s) => CALENDAR_SOURCE_LABELS[s]).join(", ")}.`
              : "Still loading some of your records…"}
          </Text>
        ) : null}

        {cal.earlierOverdue.length ? (
          <View style={[card, { backgroundColor: surfaces.tile }]}>
            <Pressable onPress={() => setShowEarlier((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showEarlier }} style={styles.navRow}>
              <Text style={[text, { flex: 1, color: theme.colors.destructive, fontFamily: theme.fontFamily.semibold }]}>
                ! {cal.earlierOverdue.length} overdue from earlier
              </Text>
              <Text style={muted}>{showEarlier ? "Hide" : "Show"}</Text>
            </Pressable>
            {showEarlier ? cal.earlierOverdue.map((e) => <CalendarEventRow key={e.id} event={e} format={fmt} onPress={open} />) : null}
          </View>
        ) : null}

        <View style={card}>
          <Text style={[text, { fontFamily: theme.fontFamily.semibold }]} accessibilityRole="header">
            {longDateLabel(selected)}
            {selected === today ? " · Today" : ""}
          </Text>
          {dayEvents.length ? (
            <Text style={muted}>
              {[totals.out ? `${fmt(totals.out)} out` : "", totals.in ? `${fmt(totals.in)} in` : "", totals.overdue ? `${totals.overdue} overdue` : ""].filter(Boolean).join(" · ") || `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
            </Text>
          ) : null}
          {dayEvents.length ? (
            dayEvents.map((e) => <CalendarEventRow key={e.id} event={e} format={fmt} onPress={open} />)
          ) : (
            <Text style={[muted, { paddingVertical: theme.space.sm }]}>
              {cal.loadState === "loading" ? "Loading…" : "Nothing financial on this day. Days with a mark have bills, income or other events."}
            </Text>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  navRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  navBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  todayBtn: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" },
});
