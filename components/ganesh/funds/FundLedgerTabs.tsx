import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gift, Receipt, Wallet, type LucideIcon } from "lucide-react-native";

import { GANESH_RADIUS } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export type FundLedger = "contributions" | "collections" | "expenses";

const ICONS: Record<FundLedger, LucideIcon> = {
  contributions: Gift,
  collections: Wallet,
  expenses: Receipt,
};

export function FundLedgerTabs({
  options,
  selected,
  onChange,
}: {
  options: Array<{ id: FundLedger; label: string; badge?: number }>;
  selected?: FundLedger;
  onChange: (id: FundLedger) => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  if (options.length === 0) return null;

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.id === selected;
        const Icon = ICONS[option.id];
        const color = active ? g.saffron : theme.colors.mutedForeground;
        return (
          <Pressable
            key={option.id}
            onPress={() => {
              if (active) return;
              void haptic.selection();
              onChange(option.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              option.badge != null ? `${option.label}, ${option.badge} promised` : option.label
            }
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: active ? g.wash(g.saffron) : theme.colors.card,
                borderColor: active ? g.saffron : g.divider,
              },
              pressed ? { opacity: 0.88 } : null,
            ]}
          >
            <Icon size={16} color={color} strokeWidth={2.2} />
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color, fontFamily: active ? theme.fontFamily.semibold : theme.fontFamily.medium },
              ]}
            >
              {option.label}
            </Text>
            {option.badge != null && option.badge > 0 ? (
              <View style={[styles.badge, { backgroundColor: g.saffron }]}>
                <Text style={[styles.badgeText, { fontFamily: theme.fontFamily.semibold }]}>
                  {option.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  label: {
    fontSize: 11.5,
    textAlign: "center",
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFF8F1",
    fontSize: 10,
  },
});
