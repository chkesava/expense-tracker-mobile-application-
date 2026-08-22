import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { X } from "lucide-react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface ActiveFilterChip {
  id: string;
  /** Rendered as "Category: Food & Dining". */
  label: string;
  onRemove: () => void;
}

export interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
}

/** Makes it obvious why the result count changed. */
export function ActiveFilterChips({
  chips,
  onClearAll,
}: ActiveFilterChipsProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  if (chips.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {chips.map((chip) => (
        <Pressable
          key={chip.id}
          onPress={() => {
            void haptic.selection();
            chip.onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${chip.label}`}
          style={({ pressed }) => [
            styles.chip,
            { backgroundColor: surface.inset, borderColor: surface.insetBorder },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[styles.chipText, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {chip.label}
          </Text>
          <X size={13} color={theme.colors.mutedForeground} strokeWidth={2.6} />
        </Pressable>
      ))}

      <Pressable
        onPress={() => {
          void haptic.selection();
          onClearAll();
        }}
        accessibilityRole="button"
        accessibilityLabel="Clear all filters"
        style={({ pressed }) => [styles.clearAll, pressed && styles.pressed]}
      >
        <Text style={[styles.clearAllText, { color: accents.pink }]}>
          Clear all
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderCurve: "continuous",
    borderWidth: 1,
    maxWidth: "100%",
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: "600",
    flexShrink: 1,
  },
  clearAll: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  clearAllText: {
    fontSize: 11.5,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.7,
  },
});
