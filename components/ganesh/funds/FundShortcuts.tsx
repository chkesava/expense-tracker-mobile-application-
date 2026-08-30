import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { AdminGlyph } from "@/components/ganesh/admin/adminArt";
import { GANESH_RADIUS } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export type FundShortcut = {
  id: string;
  label: string;
  glyph: ReactNode;
  onPress: () => void;
};

export function sponsorShortcut(onPress: () => void): FundShortcut {
  return {
    id: "sponsors",
    label: "Sponsors",
    glyph: <AdminGlyph name="iconSponsors" size={28} />,
    onPress,
  };
}

export function permanentFundShortcut(onPress: () => void): FundShortcut {
  return {
    id: "permanent",
    label: "Permanent Fund",
    glyph: <AdminGlyph name="iconFund" size={28} />,
    onPress,
  };
}

export function recordedShortcut(onPress: () => void): FundShortcut {
  return {
    id: "recorded",
    label: "Recorded",
    glyph: <AdminGlyph name="iconReports" size={28} />,
    onPress,
  };
}

export function FundShortcuts({ items }: { items: FundShortcut[] }) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  if (items.length === 0) return null;

  return (
    <View style={styles.stack}>
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
            styles.row,
            { backgroundColor: theme.colors.card, borderColor: g.divider },
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          {item.glyph}
          <Text
            numberOfLines={1}
            style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
          >
            {item.label}
          </Text>
          <ChevronRight size={16} color={g.saffron} strokeWidth={2.2} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 8,
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
  },
});
