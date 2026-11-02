import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import {
  EXPENSE_DARK_PALETTE_NAMES,
  EXPENSE_LIGHT_PALETTE_NAMES,
  EXPENSE_PALETTE_COLORS,
  EXPENSE_PALETTE_SWATCHES,
  THEME_LABELS,
  type ExpensePaletteName,
} from "@/theme/tokens";

const GROUPS: { title: string; light: boolean; names: ExpensePaletteName[] }[] = [
  { title: "Dark", light: false, names: EXPENSE_DARK_PALETTE_NAMES },
  { title: "Light", light: true, names: EXPENSE_LIGHT_PALETTE_NAMES },
];

/**
 * SPENDLY-618: choose the Expense app's palette; the whole app switches as
 * soon as one is picked. Dark tiles show the palette's six colours.
 * SPENDLY-677: light tiles show a small preview instead (a card on the
 * palette's background, with its action, accent and surface colours), since
 * a strip of pale tints says little about how the palette looks.
 */
export function ExpensePalettePicker() {
  const { theme, expensePalette, setExpensePalette } = useTheme();

  const select = (name: ExpensePaletteName) => {
    if (name === expensePalette) return;
    haptic.selection().catch(() => undefined);
    setExpensePalette(name);
  };

  return (
    <View style={styles.groups}>
      {GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text
            style={[styles.groupTitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }]}
          >
            {group.title}
          </Text>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={`${group.title} palettes`}>
            {group.names.map((name) => {
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
                  {group.light ? <LightPreview name={name} /> : <Swatches name={name} />}
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
                      {group.light ? label : label.replace(/^Midnight /, "")}
                    </Text>
                    {selected ? <Check size={16} color={theme.colors.primary} strokeWidth={2.6} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function Swatches({ name }: { name: ExpensePaletteName }) {
  return (
    <View style={styles.swatches}>
      {EXPENSE_PALETTE_SWATCHES[name].map((hex) => (
        <View key={hex} style={[styles.swatch, { backgroundColor: hex }]} />
      ))}
    </View>
  );
}

/** A miniature screen: a card on the palette background, with accent dot, title line, surface chip and action pill. */
function LightPreview({ name }: { name: ExpensePaletteName }) {
  const c = EXPENSE_PALETTE_COLORS[name];
  return (
    <View style={[styles.preview, { backgroundColor: c.background, borderColor: c.border }]}>
      <View style={[styles.previewCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.previewRow}>
          <View style={[styles.previewDot, { backgroundColor: c.accent }]} />
          <View style={[styles.previewLine, { backgroundColor: c.foreground }]} />
        </View>
        <View style={styles.previewRow}>
          <View style={[styles.previewChip, { backgroundColor: c.secondary }]} />
          <View style={[styles.previewPill, { backgroundColor: c.primary }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  groups: {
    gap: 14,
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
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
  preview: {
    height: 52,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
    justifyContent: "center",
  },
  previewCard: {
    flex: 1,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    justifyContent: "space-evenly",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewLine: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
  previewChip: {
    width: 28,
    height: 8,
    borderRadius: 4,
  },
  previewPill: {
    width: 34,
    height: 10,
    borderRadius: 5,
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
