import { StyleSheet, Text, View } from "react-native";

import { festivalDayNumber, formatFestivalWindow } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

import { ArchFrame } from "./ArchFrame";
import { GANESH_RADIUS, useSurfaces, withAlpha } from "./surfaces";
import { useGaneshTokens } from "./tokens";

/**
 * The Pandal's identity, at the top of the Command Center.
 *
 * **This hero deliberately carries no money.** The old Home screen opened with
 * the God Fund balance, which is what made the product read as an expense
 * tracker the moment it launched. What an organiser needs first is *where the
 * festival is* — which pandal, which day of how many — and the money follows
 * lower down as one of several operational readings.
 *
 * The arch is the only decoration, and it appears here and nowhere else.
 */
export function PandalHero({
  pandalName,
  festivalName,
  festival,
  today,
}: {
  pandalName?: string;
  festivalName?: string;
  festival?: { startDate?: string; endDate?: string } | null;
  /** Injectable for tests and for a stable render; defaults to the real today. */
  today?: string;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const surfaces = useSurfaces();

  const day = festivalDayNumber(festival, today);
  const window = formatFestivalWindow(festival);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: surfaces.divider },
      ]}
    >
      <ArchFrame height={78} />

      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={[
            styles.eyebrow,
            { color: g.saffron, fontFamily: theme.fontFamily.semibold },
          ]}
        >
          {pandalName || "Your Pandal"}
        </Text>

        <Text
          numberOfLines={2}
          style={[
            styles.title,
            { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
          ]}
        >
          {festivalName || "Ganesh Utsav"}
        </Text>

        {window ? (
          <Text
            numberOfLines={1}
            style={[
              styles.window,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
            ]}
          >
            {window}
          </Text>
        ) : null}

        {day ? <DayMeter day={day.day} total={day.total} /> : null}
      </View>
    </View>
  );
}

/**
 * "Day 4 of 10" with a bead per day.
 *
 * Beads, not a progress bar: a festival is a countable number of days, and ten
 * discrete marks say that better than a filled percentage. Above ~15 days the
 * beads stop being countable, so it falls back to the text alone.
 */
function DayMeter({ day, total }: { day: number; total: number }) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const surfaces = useSurfaces();

  const showBeads = total <= 15;

  return (
    <View style={styles.meter}>
      <Text
        style={[styles.dayText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
        accessibilityLabel={`Day ${day} of ${total} of the festival`}
      >
        Day {day}
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }}>
          {" "}
          of {total}
        </Text>
      </Text>

      {showBeads ? (
        <View style={styles.beads} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: total }, (_, index) => {
            const done = index < day - 1;
            const current = index === day - 1;
            return (
              <View
                key={index}
                style={[
                  styles.bead,
                  current && styles.beadCurrent,
                  {
                    backgroundColor: current
                      ? g.saffron
                      : done
                        ? withAlpha(g.saffron, 0.45)
                        : surfaces.track,
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  body: {
    padding: 16,
    paddingTop: 18,
    gap: 2,
  },
  eyebrow: {
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 25,
    letterSpacing: -0.6,
    marginTop: 3,
  },
  window: {
    fontSize: 13,
    marginTop: 2,
  },
  meter: {
    marginTop: 14,
    gap: 8,
  },
  dayText: {
    fontSize: 13.5,
    letterSpacing: -0.1,
  },
  beads: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  bead: {
    height: 5,
    flex: 1,
    minWidth: 4,
    borderRadius: 3,
  },
  beadCurrent: {
    height: 7,
  },
});
