import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";

import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { SevaRow } from "@/components/ganesh/SevaRow";
import { GANESH_RADIUS, Section, SectionAction } from "@/components/ganesh/ui";
import { SkeletonList } from "@/components/common/Skeleton";
import { haptic } from "@/lib/haptics";
import type { FestivalSeva } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

export function TodaySevaPanel({
  sevaToday,
  sevaCount,
  loading,
  upNextId,
  today,
  nowTime,
  canPlan,
  onSchedule,
  onPlan,
  onOpen,
}: {
  sevaToday: FestivalSeva[];
  sevaCount: number;
  loading: boolean;
  upNextId?: string;
  today: string;
  nowTime: string;
  canPlan: boolean;
  onSchedule: () => void;
  onPlan: () => void;
  onOpen: (id: string) => void;
}) {
  const { theme } = useTheme();
  const { diya, temple } = useArtScale();
  const empty = sevaToday.length === 0;

  return (
    <Section
      title="Today's Seva"
      subtitle={sevaToday.length > 0 ? `${sevaToday.length} planned` : undefined}
      action={sevaCount > 0 ? <SectionAction label="Schedule" onPress={onSchedule} /> : undefined}
    >
      {loading && sevaCount === 0 ? (
        <SkeletonList count={3} />
      ) : empty ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.colors.card }]}>
          <GaneshArt name="temple" width={temple} height={temple * 0.78} opacity={0.28} style={styles.mandap} />
          <GaneshArt name="diya" width={diya} height={diya} style={styles.diya} />
          <View style={styles.emptyCopy}>
            <Text
              style={[styles.emptyTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            >
              {sevaCount === 0 ? "No seva planned yet" : "Nothing planned today"}
            </Text>
            <Text
              style={[
                styles.emptyBody,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              {canPlan
                ? "Plan the aarti, annadanam and programmes so the committee knows what happens when."
                : "Your committee has not planned anything for today."}
            </Text>
            {canPlan ? (
              <Pressable
                onPress={() => {
                  void haptic.selection();
                  onPlan();
                }}
                accessibilityRole="button"
                accessibilityLabel="Plan a Seva"
                style={({ pressed }) => [styles.planButton, { backgroundColor: "#C2410C" }, pressed && { opacity: 0.88 }]}
              >
                <CalendarDays size={16} color="#FFF8F1" strokeWidth={2.2} />
                <Text style={[styles.planLabel, { fontFamily: theme.fontFamily.semibold }]}>Plan a Seva</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        sevaToday.map((item, index) => (
          <SevaRow
            key={item.id}
            seva={item}
            today={today}
            nowTime={nowTime}
            isNext={item.id === upNextId}
            isLast={index === sevaToday.length - 1}
            onPress={() => onOpen(item.id)}
          />
        ))
      )}
      {empty ? null : (
        <Text style={[styles.hint, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          Times are the Pandal wall clock. Volunteers appear on each seva.
        </Text>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    overflow: "hidden",
    minHeight: 156,
    justifyContent: "center",
  },
  mandap: {
    position: "absolute",
    right: -18,
    bottom: -10,
  },
  diya: {
    position: "absolute",
    left: 8,
    bottom: 14,
  },
  emptyCopy: {
    paddingLeft: 78,
    paddingRight: 12,
    paddingVertical: 16,
    gap: 6,
    maxWidth: 360,
  },
  emptyTitle: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  planButton: {
    alignSelf: "flex-start",
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
    color: "#FFF8F1",
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
});
