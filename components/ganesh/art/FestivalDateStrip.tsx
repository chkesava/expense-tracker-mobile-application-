import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDays, ChevronRight } from "lucide-react-native";

import { GANESH_RADIUS, withAlpha } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { festivalWindowSummary } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

export function festivalDateLine(
  festival?: { startDate?: string; endDate?: string; name?: string } | null,
  today?: string
): string {
  const window = festivalWindowSummary(festival, today);
  if (window.label) {
    return [
      `Festival dates: ${window.label}`,
      window.year,
      window.totalDays != null ? `(${window.totalDays} Day${window.totalDays === 1 ? "" : "s"})` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return festival?.name || "Festival dates will appear once the committee sets them.";
}

export function FestivalDateStrip({
  festival,
  today,
  onPress,
}: {
  festival?: { startDate?: string; endDate?: string; name?: string } | null;
  today?: string;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const dateLine = festivalDateLine(festival, today);

  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              void haptic.selection();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={dateLine}
      style={({ pressed }) => [
        styles.strip,
        {
          backgroundColor: theme.colors.card,
          borderColor: withAlpha(g.gold, 0.45),
        },
        pressed && onPress ? { opacity: 0.88 } : null,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: g.wash(g.saffron) }]}>
        <CalendarDays size={16} color={g.saffron} strokeWidth={2.2} />
      </View>
      <Text
        style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
        numberOfLines={2}
      >
        {dateLine}
      </Text>
      <ChevronRight size={18} color={g.saffron} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginHorizontal: 16,
    marginTop: -10,
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 4,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    lineHeight: 18,
  },
});
