import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import {
  EXPENSE_PALETTE_NAMES,
  EXPENSE_PALETTE_SWATCHES,
  THEME_LABELS,
  type ExpensePaletteName,
} from "@/theme/tokens";

/**
 * SPENDLY-618: choose the Expense app's palette. Each tile shows the
 * palette's six colours; the whole app switches as soon as one is picked.
 */
export function ExpensePalettePicker() {
  const { theme, expensePalette, setExpensePalette } = useTheme();

  const select = (name: ExpensePaletteName) => {
    if (name === expensePalette) return;
    haptic.selection().catch(() => undefined);
    setExpensePalette(name);
  };

  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {EXPENSE_PALETTE_NAMES.map((name) => {
        const selected = name === expensePalette;
        const label = THEME_LABELS[name];
        return (
          <Pressable
            key={name}
            onPress={() => select(name)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${label} palette`}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: theme.colors.card,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                borderWidth: selected ? 2 : 1,
              },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.swatches}>
              {EXPENSE_PALETTE_SWATCHES[name].map((hex) => (
                <View key={hex} style={[styles.swatch, { backgroundColor: hex }]} />
              ))}
            </View>
            <View style={styles.labelRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  {
                    color: selected ? theme.colors.foreground : theme.colors.mutedForeground,
                    fontFamily: selected ? theme.fontFamily.bold : theme.fontFamily.medium,
                  },
                ]}
              >
                {label.replace(/^Midnight /, "")}
              </Text>
              {selected ? <Check size={16} color={theme.colors.primary} strokeWidth={2.6} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 140,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 10,
    gap: 10,
  },
  swatches: {
    flexDirection: "row",
    height: 36,
    borderRadius: 10,
    overflow: "hidden",
  },
  swatch: {
    flex: 1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
    gap: 6,
  },
  label: {
    fontSize: 14,
  },
  pressed: {
    opacity: 0.85,
  },
});
