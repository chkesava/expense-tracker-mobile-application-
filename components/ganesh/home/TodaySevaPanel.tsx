import { StyleSheet, Text } from "react-native";
import { Flame } from "lucide-react-native";

import { SevaRow } from "@/components/ganesh/SevaRow";
import { GaneshEmptyState, Section, SectionAction, useGaneshTokens } from "@/components/ganesh/ui";
import { SkeletonList } from "@/components/common/Skeleton";
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
  const g = useGaneshTokens();
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
        <GaneshEmptyState
          compact
          icon={<Flame size={20} color={g.saffron} strokeWidth={1.9} />}
          title={sevaCount === 0 ? "No seva planned yet" : "Nothing planned today"}
          description={
            canPlan
              ? "Plan the aarti, annadanam and programmes so the committee knows what happens when."
              : "Your committee has not planned anything for today."
          }
          action={canPlan ? { label: "Plan a Seva", onPress: onPlan } : undefined}
        />
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
  hint: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
});
