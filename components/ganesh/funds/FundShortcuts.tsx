import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, FileText, Landmark, Users, type LucideIcon } from "lucide-react-native";

import { GANESH_RADIUS } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export type FundShortcut = {
  id: string;
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
};

export function sponsorShortcut(onPress: () => void): FundShortcut {
  return { id: "sponsors", label: "Sponsors", Icon: Users, onPress };
}

export function permanentFundShortcut(onPress: () => void): FundShortcut {
  return { id: "permanent", label: "Permanent Fund", Icon: Landmark, onPress };
}

export function recordedShortcut(onPress: () => void): FundShortcut {
  return { id: "recorded", label: "Recorded", Icon: FileText, onPress };
}

export function FundShortcuts({ items }: { items: FundShortcut[] }) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  if (items.length === 0) return null;

  return (
    <View style={styles.row}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => {
            void haptic.selection();
            item.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          style={({ pressed }) => [
            styles.tile,
            { backgroundColor: theme.colors.card, borderColor: g.divider },
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          <item.Icon size={16} color={g.saffron} strokeWidth={2.2} />
          <Text
            numberOfLines={2}
            style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
          >
            {item.label}
          </Text>
          <ChevronRight size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  tile: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 15,
  },
});
