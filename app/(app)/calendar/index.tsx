import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter, type Href } from "expo-router";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";

import { CalendarEventRow } from "@/components/calendar/CalendarEventRow";
import { CalendarEventSheet } from "@/components/calendar/CalendarEventSheet";
import { CalendarLegend, CalendarMonthGrid } from "@/components/calendar/CalendarMonthGrid";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { useFinancialCalendar } from "@/hooks/useFinancialCalendar";
import { useSettings } from "@/providers/SettingsProvider";
import type { CalendarEvent } from "@/shared/types/calendar";
import { agendaRange, agendaTitle, buildAgendaRows, shiftAgenda, type AgendaRow, type AgendaSpan } from "@/shared/utils/calendarAgenda";
import { CALENDAR_SOURCE_LABELS, buildMonthGrid, dayTotals, longDateLabel, monthTitle, nextMonth, previousMonth } from "@/shared/utils/calendarMonth";
import { monthGridRange } from "@/shared/utils/calendarQuery";
import { todayDateKey } from "@/shared/utils/dates";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Financial Calendar (SPENDLY-179 month view, SPENDLY-180 agenda): one place
 * to see what happens financially on each day. Read-only — every event comes
 * from its canonical record and opens that record.
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
  // SPENDLY-180: agenda view state.
  const [view, setView] = useState<"month" | "agenda">("month");
  const [span, setSpan] = useState<AgendaSpan>("week");
  const [anchor, setAnchor] = useState(today);

  const range = useMemo(
    () => (view === "month" ? monthGridRange(month, firstDay) : agendaRange(span, anchor, firstDay)),
    [view, month, firstDay, span, anchor]
  );
  const cal = useFinancialCalendar(range);
  const fmt = useCallback((n: number) => formatAmount(n, cal.currency), [cal.currency]);
  const grid = useMemo(() => buildMonthGrid(month, firstDay, cal.byDate, today, selected), [month, firstDay, cal.byDate, today, selected]);
  const dayEvents = cal.byDate.get(selected) ?? [];
  const totals = dayTotals(dayEvents);

  const go = (m: string) => {
    setMonth(m);
    setSelected(m === today.slice(0, 7) ? today : `${m}-01`);
  };
  // SPENDLY-181: tapping an event opens its detail sheet. The event is looked
  // up from live data each render, so a deleted source shows as unavailable.
  const [detailId, setDetailId] = useState<string | null>(null);
  const open = useCallback((e: CalendarEvent) => setDetailId(e.id), []);
  const detailEvent = detailId ? cal.events.find((e) => e.id === detailId) ?? cal.earlierOverdue.find((e) => e.id === detailId) ?? null : null;
  const agenda = useMemo(
    () => (view === "agenda" ? buildAgendaRows({ events: cal.events, earlierOverdue: cal.earlierOverdue, today }) : null),
    [view, cal.events, cal.earlierOverdue, today]
  );
  /** Back to the month grid with this day selected. */
  const showDayInMonth = useCallback((date: string) => {
    setMonth(date.slice(0, 7));
    setSelected(date);
    setView("month");
  }, []);

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

  const viewSwitch = (
    <SegmentedControl<"month" | "agenda">
      options={[
        { value: "month", label: "Month" },
        { value: "agenda", label: "Agenda" },
      ]}
      value={view}
      onChange={(v) => {
        if (v === "agenda") setAnchor(view === "month" ? selected : anchor);
        setView(v);
      }}
    />
  );

  const renderAgendaRow = ({ item }: { item: AgendaRow }) => {
    if (item.type === "section") {
      return item.overdue ? (
        <Text style={[text, { color: theme.colors.destructive, fontFamily: theme.fontFamily.semibold, marginTop: theme.space.md }]} accessibilityRole="header">
          ! {item.title}
        </Text>
      ) : (
        <Pressable
          onPress={() => showDayInMonth(item.key.slice(2))}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. Show this day in the month view`}
          style={{ marginTop: theme.space.md, minHeight: 32, justifyContent: "center" }}
        >
          <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{item.title}</Text>
        </Pressable>
      );
    }
    if (item.type === "empty") return <Text style={[muted, { paddingVertical: theme.space.lg, textAlign: "center" }]}>{item.text}</Text>;
    return (
      <View style={item.isNext ? { borderLeftWidth: 3, borderLeftColor: theme.colors.primary, paddingLeft: theme.space.sm } : undefined}>
        {item.isNext ? <Text style={[muted, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>Next financial event</Text> : null}
        <CalendarEventRow event={item.event} format={fmt} onPress={open} />
      </View>
    );
  };

  let body;
  if (cal.loadState === "error") {
    body = <ErrorState title="Couldn't load your calendar" description="None of your financial data could be read. Check your connection and try again." />;
  } else if (view === "agenda" && agenda) {
    const title = agendaTitle(range);
    body = (
      <FlashList
        data={agenda.rows}
        keyExtractor={(r) => r.key}
        getItemType={(r) => r.type}
        renderItem={renderAgendaRow}
        contentContainerStyle={{ paddingHorizontal: theme.space.lg, paddingBottom: bottomPadding }}
        ListHeaderComponent={
          <View style={{ gap: theme.space.md, paddingTop: theme.space.lg }}>
            {viewSwitch}
            <SegmentedControl<AgendaSpan>
              options={[
                { value: "week", label: "This week" },
                { value: "next30", label: "Next 30 days" },
              ]}
              value={span}
              onChange={(v) => {
                setSpan(v);
                setAnchor(today);
              }}
            />
            <View style={styles.navRow}>
              <Pressable onPress={() => setAnchor(shiftAgenda(span, anchor, -1))} accessibilityRole="button" accessibilityLabel="Previous period" hitSlop={8} style={styles.navBtn}>
                <ChevronLeft size={22} color={theme.colors.foreground} />
              </Pressable>
              <Text style={[h2, { flex: 1, textAlign: "center" }]} accessibilityRole="header">
                {title}
              </Text>
              <Pressable onPress={() => setAnchor(shiftAgenda(span, anchor, 1))} accessibilityRole="button" accessibilityLabel="Next period" hitSlop={8} style={styles.navBtn}>
                <ChevronRight size={22} color={theme.colors.foreground} />
              </Pressable>
              <Pressable
                onPress={() => setAnchor(today)}
                accessibilityRole="button"
                accessibilityLabel="Go to today"
                style={[styles.todayBtn, { borderColor: theme.colors.border, borderRadius: theme.radius.md }]}
              >
                <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>Today</Text>
              </Pressable>
            </View>
            {cal.loadState === "partial" ? (
              <Text style={muted} accessibilityLiveRegion="polite">
                {cal.failedSources.length ? `Some items couldn't load: ${cal.failedSources.map((src) => CALENDAR_SOURCE_LABELS[src]).join(", ")}.` : "Still loading some of your records…"}
              </Text>
            ) : null}
            {cal.loadState === "loading" && cal.events.length === 0 ? <LoadingState variant="list" count={3} /> : null}
          </View>
        }
      />
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.md }}>
        {viewSwitch}
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
      <CalendarEventSheet
        isOpen={detailId !== null}
        event={detailEvent}
        format={fmt}
        onClose={() => setDetailId(null)}
        onAction={(a) => {
          setDetailId(null);
          router.push(a.href as Href);
        }}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  navRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  navBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  todayBtn: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" },
});
