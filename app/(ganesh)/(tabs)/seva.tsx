import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays, CalendarPlus, Clock, Plus } from "lucide-react-native";

import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { VolunteerIcon } from "@/components/ganesh/art/icons";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { SevaHero } from "@/components/ganesh/seva/SevaHero";
import { SevaRow } from "@/components/ganesh/SevaRow";
import {
  GaneshEmptyState,
  GANESH_RADIUS,
  Section,
  SectionAction,
  StatTile,
  useGaneshTokens,
  useSurfaces,
} from "@/components/ganesh/ui";
import { SkeletonList } from "@/components/common/Skeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { useFestivals } from "@/hooks/useFestivals";
import { useFestivalSeva } from "@/hooks/useFestivalSeva";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { haptic } from "@/lib/haptics";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import {
  currentTimeInput,
  festivalDates,
  formatSevaDate,
  groupSevaByDay,
  nextSeva,
  sevaForDate,
  sevaStatusOf,
  todaySeva,
  unstaffedSeva,
} from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The festival's operational calendar.
 *
 * A day strip across the festival window, then that day's programme on a time
 * rail. When a festival has no dates set, the strip falls back to whichever
 * days actually have seva on them, so the screen is useful before anybody fills
 * in the window.
 */
export default function SevaScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const surfaces = useSurfaces();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { seva, loading, error, retry } = useFestivalSeva(pandalId, festivalId);
  const { can, isAdmin } = useGaneshPermissions();

  const festival = festivals.find((item) => item.id === festivalId);
  const closed = festival?.status === "closed";
  const canPlan = can("seva.write") && !closed;
  const canReadPeople = can("members.read");

  const today = todayDateInput();
  const nowTime = currentTimeInput();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    retry();
    setTimeout(() => setRefreshing(false), 600);
  }, [retry]);

  /**
   * Prefer the festival's own window; fall back to the days that have seva.
   * Union of both, so a seva scheduled outside the window is still reachable
   * rather than silently invisible.
   */
  const days = useMemo(() => {
    const fromFestival = festivalDates(festival);
    const fromSeva = groupSevaByDay(seva).map((group) => group.date);
    const merged = [...new Set([...fromFestival, ...fromSeva])].sort();
    return merged;
  }, [festival, seva]);

  const activeDate = selectedDate ?? (days.includes(today) ? today : days[0]) ?? today;
  const dayItems = useMemo(() => sevaForDate(seva, activeDate), [seva, activeDate]);
  const sevaToday = useMemo(() => todaySeva(seva, today), [seva, today]);
  const upNext = useMemo(() => nextSeva(seva, today, nowTime), [seva, today, nowTime]);
  const unstaffed = useMemo(() => unstaffedSeva(seva, today), [seva, today]);

  const completedToday = sevaToday.filter((item) => sevaStatusOf(item) === "completed").length;

  return (
    <GaneshScreen
      withTabBar
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.bleed}
    >
      <SevaHero
        festivalName={festival?.name}
        festival={festival}
        today={today}
        onFestivalDates={isAdmin ? () => push("/(ganesh)/admin/festivals" as never) : undefined}
        rightAccessory={<GaneshSyncChip onDark />}
      />

      <View style={styles.body}>
        {loading && seva.length === 0 ? (
          <SkeletonList count={4} />
        ) : error ? (
          <ErrorState
            title="Couldn't load the schedule"
            description="Check your connection and try again."
            onRetry={retry}
          />
        ) : (
          <>
            <Section
              title="Today's Seva"
              action={
                seva.length > 0 ? (
                  <SectionAction label="View all" onPress={() => setSelectedDate(today)} />
                ) : undefined
              }
            >
              {sevaToday.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: surfaces.tile }]}>
                  <View pointerEvents="none" style={styles.mandalaWrap}>
                    <GaneshArt name="mandala" width={168} height={168} opacity={0.14} />
                  </View>
                  <View style={styles.emptyGraphic}>
                    <GaneshArt name="diya" width={28} height={28} />
                    <View style={[styles.calendarMark, { backgroundColor: g.wash(g.saffron) }]}>
                      <CalendarPlus size={22} color={g.saffron} strokeWidth={2.1} />
                    </View>
                    <GaneshArt name="diya" width={28} height={28} />
                  </View>
                  <Text
                    style={[
                      styles.emptyTitle,
                      { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                    ]}
                  >
                    No seva planned yet
                  </Text>
                  <Text
                    style={[
                      styles.emptyBody,
                      { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                    ]}
                  >
                    {canPlan
                      ? "Add the aarti, annadanam and programmes your committee runs, so everyone knows what happens when."
                      : "Your committee has not planned the festival programme yet."}
                  </Text>
                  {canPlan ? (
                    <Pressable
                      onPress={() => {
                        void haptic.selection();
                        push("/(ganesh)/add-seva" as never);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Plan a Seva"
                      style={({ pressed }) => [
                        styles.planButton,
                        { backgroundColor: theme.colors.primary },
                        pressed ? { opacity: 0.88 } : null,
                      ]}
                    >
                      <CalendarDays size={16} color={theme.colors.primaryForeground} strokeWidth={2.2} />
                      <Text
                        style={[
                          styles.planLabel,
                          { color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.semibold },
                        ]}
                      >
                        Plan a Seva
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                sevaToday.map((item, index) => (
                  <SevaRow
                    key={item.id}
                    seva={item}
                    today={today}
                    nowTime={nowTime}
                    isNext={item.id === upNext?.id}
                    isLast={index === sevaToday.length - 1}
                    onPress={() => push(`/(ganesh)/seva/${item.id}` as never)}
                  />
                ))
              )}
            </Section>

            <View style={[styles.upcoming, { backgroundColor: surfaces.tile, borderColor: g.divider }]}>
              <View style={[styles.upcomingIcon, { backgroundColor: g.wash(g.saffron) }]}>
                <Clock size={18} color={g.saffron} strokeWidth={2.2} />
              </View>
              <View style={styles.upcomingCopy}>
                <Text
                  style={[
                    styles.upcomingTitle,
                    { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                  ]}
                  numberOfLines={1}
                >
                  {upNext ? upNext.name : "No upcoming seva"}
                </Text>
                <Text
                  style={[
                    styles.upcomingMeta,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                  ]}
                  numberOfLines={2}
                >
                  {upNext
                    ? [formatSevaDate(upNext.date, true), upNext.startTime].filter(Boolean).join(" · ")
                    : "Plan your next seva and keep everyone informed."}
                </Text>
              </View>
              <GaneshArt name="temple" width={72} height={58} opacity={0.45} />
            </View>

            {canPlan || canReadPeople ? (
              <Section title="Quick Seva Actions" plain>
                <View style={styles.actionRow}>
                  {canPlan ? (
                    <Pressable
                      onPress={() => {
                        void haptic.selection();
                        push("/(ganesh)/add-seva" as never);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Plan a Seva"
                      style={({ pressed }) => [
                        styles.actionTile,
                        { backgroundColor: theme.colors.card, borderColor: g.divider },
                        pressed ? { opacity: 0.85 } : null,
                      ]}
                    >
                      <View style={[styles.actionGlyph, { backgroundColor: g.wash(g.saffron) }]}>
                        <CalendarPlus size={18} color={g.saffron} strokeWidth={2.2} />
                      </View>
                      <Text
                        style={[
                          styles.actionTitle,
                          { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                        ]}
                      >
                        Plan a Seva
                      </Text>
                      <Text
                        style={[
                          styles.actionMeta,
                          { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                        ]}
                      >
                        Add new seva or programme
                      </Text>
                    </Pressable>
                  ) : null}
                  {canReadPeople ? (
                    <Pressable
                      onPress={() => {
                        void haptic.selection();
                        push("/(ganesh)/(tabs)/people" as never);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Volunteer"
                      style={({ pressed }) => [
                        styles.actionTile,
                        { backgroundColor: theme.colors.card, borderColor: g.divider },
                        pressed ? { opacity: 0.85 } : null,
                      ]}
                    >
                      <VolunteerIcon size={40} />
                      <Text
                        style={[
                          styles.actionTitle,
                          { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                        ]}
                      >
                        Volunteer
                      </Text>
                      <Text
                        style={[
                          styles.actionMeta,
                          { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                        ]}
                      >
                        Assign volunteers to seva
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Section>
            ) : null}

            {seva.length > 0 ? (
              <>
                <View style={styles.statRow}>
                  <StatTile label="Today">
                    <Text
                      style={[
                        styles.count,
                        { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                      ]}
                    >
                      {completedToday}
                      <Text style={{ color: theme.colors.mutedForeground }}> / {sevaToday.length}</Text>
                    </Text>
                  </StatTile>
                  <StatTile label="Up next">
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.upNext,
                        { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                      ]}
                    >
                      {upNext?.name ?? "All done"}
                    </Text>
                  </StatTile>
                  <StatTile label="Unstaffed">
                    <Text
                      style={[
                        styles.count,
                        {
                          color: unstaffed.length > 0 ? theme.colors.warning : theme.colors.foreground,
                          fontFamily: theme.fontFamily.semibold,
                        },
                      ]}
                    >
                      {unstaffed.length}
                    </Text>
                  </StatTile>
                </View>

                {days.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.strip}
                  >
                    {days.map((date) => {
                      const active = date === activeDate;
                      const isToday = date === today;
                      const count = sevaForDate(seva, date).length;
                      return (
                        <Pressable
                          key={date}
                          onPress={() => {
                            void haptic.selection();
                            setSelectedDate(date);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${formatSevaDate(date, true)}, ${count} seva`}
                          style={[
                            styles.day,
                            {
                              backgroundColor: active ? g.wash(g.saffron) : surfaces.tile,
                              borderColor: active ? g.saffron : "transparent",
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
                            {isToday ? "Today" : formatSevaDate(date, true).slice(0, 3)}
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
                          <View
                            style={[
                              styles.dayDot,
                              {
                                backgroundColor:
                                  count > 0 ? (active ? g.saffron : g.wash(g.saffron)) : "transparent",
                              },
                            ]}
                          />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}

                <Section
                  title={formatSevaDate(activeDate, true) || "Programme"}
                  subtitle={activeDate === today ? "Today" : undefined}
                  badge={
                    canPlan ? (
                      <Pressable
                        onPress={() => {
                          void haptic.selection();
                          push(`/(ganesh)/add-seva?date=${activeDate}` as never);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Add a seva on this day"
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.addButton,
                          { backgroundColor: g.wash(g.saffron) },
                          pressed ? { opacity: 0.8 } : null,
                        ]}
                      >
                        <Plus size={16} color={g.saffron} strokeWidth={2.4} />
                      </Pressable>
                    ) : undefined
                  }
                >
                  {dayItems.length === 0 ? (
                    <GaneshEmptyState
                      compact
                      icon={<CalendarDays size={20} color={g.saffron} strokeWidth={1.9} />}
                      title="Nothing planned this day"
                      description={canPlan ? "Add the day's first seva." : undefined}
                      action={
                        canPlan
                          ? {
                              label: "Add seva",
                              onPress: () => push(`/(ganesh)/add-seva?date=${activeDate}` as never),
                            }
                          : undefined
                      }
                    />
                  ) : (
                    dayItems.map((item, index) => (
                      <SevaRow
                        key={item.id}
                        seva={item}
                        today={today}
                        nowTime={nowTime}
                        isNext={item.id === upNext?.id}
                        isLast={index === dayItems.length - 1}
                        onPress={() => push(`/(ganesh)/seva/${item.id}` as never)}
                      />
                    ))
                  )}
                </Section>
              </>
            ) : null}
          </>
        )}
      </View>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  bleed: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  emptyCard: {
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    overflow: "hidden",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 8,
  },
  mandalaWrap: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
  },
  emptyGraphic: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  calendarMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 16,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  planButton: {
    marginTop: 8,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: GANESH_RADIUS.pill,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planLabel: {
    fontSize: 14,
  },
  upcoming: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  upcomingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  upcomingTitle: {
    fontSize: 14.5,
  },
  upcomingMeta: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionTile: {
    flex: 1,
    minHeight: 112,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionGlyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 13,
    textAlign: "center",
  },
  actionMeta: {
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: "center",
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  count: {
    fontSize: 17,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  upNext: {
    fontSize: 13.5,
    letterSpacing: -0.1,
  },
  strip: {
    gap: 8,
    paddingVertical: 2,
  },
  day: {
    width: 54,
    paddingVertical: 9,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    gap: 2,
  },
  dayWeek: {
    fontSize: 10.5,
    letterSpacing: 0.3,
  },
  dayNum: {
    fontSize: 16,
    fontVariant: ["tabular-nums"],
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
});
