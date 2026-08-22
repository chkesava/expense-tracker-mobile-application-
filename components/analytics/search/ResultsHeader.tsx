import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/** Client-side orderings over the already-loaded result set. */
export type SearchSort = "latest" | "oldest" | "highest" | "lowest";

export const SEARCH_SORT_OPTIONS: { id: SearchSort; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "oldest", label: "Oldest" },
  { id: "highest", label: "Highest Amount" },
  { id: "lowest", label: "Lowest Amount" },
];

export interface ResultsHeaderProps {
  count: number;
  sort: SearchSort;
  onSortChange: (sort: SearchSort) => void;
}

export function ResultsHeader({
  count,
  sort,
  onSortChange,
}: ResultsHeaderProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeLabel =
    SEARCH_SORT_OPTIONS.find((option) => option.id === sort)?.label ?? "Latest";

  return (
    <View style={styles.row}>
      <Text
        style={[styles.count, { color: theme.colors.foreground }]}
        numberOfLines={1}
      >
        {count} Result{count === 1 ? "" : "s"}
      </Text>

      <Pressable
        onPress={() => {
          void haptic.selection();
          setMenuOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${activeLabel}`}
        style={({ pressed }) => [
          styles.sortBtn,
          { backgroundColor: surface.card, borderColor: surface.border },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.sortLabel, { color: theme.colors.mutedForeground }]}>
          Sort:
        </Text>
        <Text style={[styles.sortValue, { color: accents.green }]}>
          {activeLabel}
        </Text>
        <ChevronDown size={14} color={accents.green} strokeWidth={2.4} />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable
            // Swallow presses so tapping the sheet doesn't dismiss it.
            onPress={() => undefined}
            style={[
              styles.menu,
              { backgroundColor: surface.card, borderColor: surface.border },
            ]}
          >
            <Text
              style={[styles.menuTitle, { color: theme.colors.mutedForeground }]}
            >
              SORT RESULTS
            </Text>
            {SEARCH_SORT_OPTIONS.map((option) => {
              const isActive = option.id === sort;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    void haptic.selection();
                    onSortChange(option.id);
                    setMenuOpen(false);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: isActive }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    isActive && { backgroundColor: accents.greenDim },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      {
                        color: isActive ? accents.green : theme.colors.foreground,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isActive ? (
                    <Check size={16} color={accents.green} strokeWidth={2.6} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  count: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    flexShrink: 0,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  sortValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  menu: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 10,
    gap: 2,
  },
  menuTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 46,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  menuItemText: {
    fontSize: 14,
  },
  pressed: {
    opacity: 0.75,
  },
});
