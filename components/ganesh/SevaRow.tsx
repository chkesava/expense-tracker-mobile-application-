import { Pressable, StyleSheet, Text, View } from "react-native";
import { Users } from "lucide-react-native";

import { GANESH_RADIUS, useSurfaces, withAlpha } from "@/components/ganesh/ui/surfaces";
import { SevaGlyph } from "@/components/ganesh/ui/SevaGlyph";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import type { FestivalSeva } from "@/shared/types/ganesh";
import {
  formatSevaTime,
  isSevaOverdue,
  sevaStatusLabel,
  sevaStatusOf,
} from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One seva on a time rail.
 *
 * The rail — a time on the left, a connecting line, a glyph — is what makes a
 * schedule read as a schedule rather than as another list of cards. It is the
 * Command Center's signature row and the reason Home no longer looks like a
 * ledger.
 *
 * Status is carried by a text label as well as colour, so it survives both
 * colour blindness and bright outdoor light.
 */
export function SevaRow({
  seva,
  isNext = false,
  isLast = false,
  today,
  nowTime,
  onPress,
}: {
  seva: FestivalSeva;
  /** The one the pandal should be doing now — gets the emphasis. */
  isNext?: boolean;
  isLast?: boolean;
  today?: string;
  nowTime?: string;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const surfaces = useSurfaces();

  const status = sevaStatusOf(seva);
  const overdue = isSevaOverdue(seva, today, nowTime);
  const tint = g.sevaColor(seva.kind);
  const done = status === "completed";

  const statusTone = done
    ? g.godFund
    : status === "in_progress"
      ? g.saffron
      : overdue
        ? theme.colors.warning
        : theme.colors.mutedForeground;

  const statusText = status === "scheduled" && overdue ? "Not started" : sevaStatusLabel(status);
  const duties = seva.dutyCount ?? 0;

  const body = (
    <View style={styles.row}>
      {/* Time rail */}
      <View style={styles.rail}>
        <Text
          style={[
            styles.time,
            {
              color: isNext ? theme.colors.foreground : theme.colors.mutedForeground,
              fontFamily: isNext ? theme.fontFamily.semibold : theme.fontFamily.medium,
            },
          ]}
          numberOfLines={1}
        >
          {formatSevaTime(seva.startTime)}
        </Text>
      </View>

      <View style={styles.spine}>
        <View
          style={[
            styles.glyph,
            {
              backgroundColor: done ? surfaces.tile : g.wash(tint),
              borderColor: isNext ? withAlpha(tint, 0.6) : "transparent",
              borderWidth: isNext ? 1.5 : 0,
            },
          ]}
        >
          <SevaGlyph
            kind={seva.kind}
            size={15}
            color={done ? theme.colors.mutedForeground : tint}
          />
        </View>
        {!isLast ? (
          <View style={[styles.connector, { backgroundColor: surfaces.divider }]} />
        ) : null}
      </View>

      <View style={styles.content}>
        <Text
          numberOfLines={1}
          style={[
            styles.name,
            {
              color: done ? theme.colors.mutedForeground : theme.colors.foreground,
              fontFamily: isNext ? theme.fontFamily.semibold : theme.fontFamily.medium,
              textDecorationLine: done ? "line-through" : "none",
            },
          ]}
        >
          {seva.name}
        </Text>

        <View style={styles.metaRow}>
          <Text
            numberOfLines={1}
            style={[styles.status, { color: statusTone, fontFamily: theme.fontFamily.medium }]}
          >
            {statusText}
          </Text>

          {seva.location ? (
            <Text
              numberOfLines={1}
              style={[
                styles.meta,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              · {seva.location}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.volunteers}>
        <Users
          size={13}
          color={duties === 0 ? theme.colors.warning : theme.colors.mutedForeground}
          strokeWidth={2.2}
        />
        <Text
          style={[
            styles.count,
            {
              color: duties === 0 ? theme.colors.warning : theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.medium,
            },
          ]}
          accessibilityLabel={
            duties === 0 ? "No volunteers assigned" : `${duties} volunteers assigned`
          }
        >
          {duties}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${seva.name} at ${formatSevaTime(seva.startTime)}, ${statusText}`}
      android_ripple={{ color: g.ripple, borderless: false }}
      style={({ pressed }) => [pressed && { opacity: 0.85 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minHeight: 56,
  },
  rail: {
    width: 62,
    paddingTop: 7,
  },
  time: {
    fontSize: 12.5,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  spine: {
    alignItems: "center",
    alignSelf: "stretch",
  },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: GANESH_RADIUS.glyph,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  connector: {
    width: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 12,
    marginTop: 3,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingTop: 5,
    paddingBottom: 12,
    gap: 2,
  },
  name: {
    fontSize: 14.5,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  status: {
    fontSize: 11.5,
  },
  meta: {
    flexShrink: 1,
    fontSize: 11.5,
  },
  volunteers: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingTop: 8,
  },
  count: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
