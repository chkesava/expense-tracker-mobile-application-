import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays, Flame, Plus } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { SevaRow } from "@/components/ganesh/SevaRow";
import {
  GaneshEmptyState,
  GaneshHeader,
  GANESH_RADIUS,
  Section,
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
  const { can } = useGaneshPermissions();

  const festival = festivals.find((item) => item.id === festivalId);
  const closed = festival?.status === "closed";
  const canPlan = can("seva.write") && !closed;

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
  const upNext = useMemo(() => nextSeva(seva, today, nowTime), [seva, today, nowTime]);
  const unstaffed = useMemo(() => unstaffedSeva(seva, today), [seva, today]);

  const completedToday = sevaForDate(seva, today).filter(
    (item) => sevaStatusOf(item) === "completed"
  ).length;
  const totalToday = sevaForDate(seva, today).length;

  return (
    <GaneshScreen safeTop withTabBar refreshing={refreshing} onRefresh={handleRefresh}>
      <GaneshHeader
        title="Seva"
        subtitle={festival?.name}
        icon={<Flame size={22} color={g.saffron} strokeWidth={2.2} />}
        rightElement={<GaneshSyncChip />}
      />

      {loading && seva.length === 0 ? (
        <SkeletonList count={4} />
      ) : error ? (
        <ErrorState
          title="Couldn't load the schedule"
          description="Check your connection and try again."
          onRetry={retry}
        />
      ) : seva.length === 0 ? (
        <GaneshEmptyState
          icon={<CalendarDays size={26} color={g.saffron} strokeWidth={1.9} />}
          title="No seva planned yet"
          description={
            canPlan
              ? "Add the aarti, annadanam and programmes your committee runs, so everyone knows what happens when."
              : "Your committee has not planned the festival programme yet."
          }
          action={
            canPlan ? { label: "Plan a seva", onPress: () => push("/(ganesh)/add-seva" as never) } : undefined
          }
        />
      ) : (
        <>
          <View style={styles.statRow}>
            <StatTile label="Today">
              <Text
                style={[styles.count, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
              >
                {completedToday}
                <Text style={{ color: theme.colors.mutedForeground }}> / {totalToday}</Text>
              </Text>
            </StatTile>
            <StatTile label="Up next">
              <Text
                numberOfLines={1}
                style={[styles.upNext, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
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
                    pressed && { opacity: 0.8 },
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
      )}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
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
