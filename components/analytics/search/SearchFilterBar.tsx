import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { haptic } from "@/lib/haptics";
import type { DatePreset } from "@/components/analytics/FilterSheetModal";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

/** Quick presets mirror the date options the filter sheet already supports. */
const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "All" },
  { id: "this_month", label: "This Month" },
  { id: "last_30_days", label: "30D" },
  { id: "this_year", label: "This Year" },
];

export interface SearchFilterBarProps {
  datePreset: DatePreset;
  onDatePresetChange: (preset: DatePreset) => void;
  /** Number of active filters, used for the indicator dot. */
  activeFilterCount: number;
  onOpenFilters: () => void;
}

export function SearchFilterBar({
  datePreset,
  onDatePresetChange,
  activeFilterCount,
  onOpenFilters,
}: SearchFilterBarProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          void haptic.selection();
          onOpenFilters();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          activeFilterCount > 0
            ? `Filters, ${activeFilterCount} active`
            : "Filters"
        }
        style={({ pressed }) => [
          styles.chip,
          styles.filterChip,
          {
            backgroundColor: surface.card,
            borderColor: activeFilterCount > 0 ? accents.greenDim : surface.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <SlidersHorizontal
          size={15}
          color={theme.colors.foreground}
          strokeWidth={2.2}
        />
        <Text style={[styles.chipText, { color: theme.colors.foreground }]}>
          Filters
        </Text>
        {activeFilterCount > 0 ? (
          <View style={[styles.dot, { backgroundColor: accents.green }]} />
        ) : null}
      </Pressable>

      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
        >
          {DATE_PRESETS.map((preset) => {
            const isActive = datePreset === preset.id;
            return (
              <Pressable
                key={preset.id}
                onPress={() => {
                  if (isActive) return;
                  void haptic.selection();
                  onDatePresetChange(preset.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: isActive ? accents.pinkDim : surface.card,
                    borderColor: isActive
                      ? isDark
                        ? "rgba(244, 63, 94, 0.45)"
                        : "rgba(220, 38, 38, 0.28)"
                      : surface.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: isActive ? accents.pink : theme.colors.mutedForeground,
                      fontWeight: isActive ? "700" : "600",
                    },
                  ]}
                >
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </HorizontalSwipeBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipScroll: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    justifyContent: "center",
  },
  filterChip: {
    flexShrink: 0,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pressed: {
    opacity: 0.72,
  },
});
