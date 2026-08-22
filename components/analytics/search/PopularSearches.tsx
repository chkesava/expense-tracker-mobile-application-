import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Sparkles, X } from "lucide-react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

export interface PopularSearchesProps {
  /** Suggestions derived from the user's own transactions. */
  suggestions: string[];
  onSelect: (term: string) => void;
  onDismiss: () => void;
}

export function PopularSearches({
  suggestions,
  onSelect,
  onDismiss,
}: PopularSearchesProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  if (suggestions.length === 0) return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface.card, borderColor: surface.border },
      ]}
    >
      <View style={styles.head}>
        <Sparkles size={14} color={accents.violet} strokeWidth={2.4} />
        <Text
          style={[styles.title, { color: theme.colors.foreground }]}
          numberOfLines={1}
        >
          Popular searches
        </Text>
      </View>

      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
        >
          {suggestions.map((term) => (
            <Pressable
              key={term}
              onPress={() => {
                void haptic.selection();
                onSelect(term);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${term}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: surface.inset,
                  borderColor: surface.insetBorder,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.chipText, { color: theme.colors.foreground }]}
                numberOfLines={1}
              >
                {term}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>

      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Hide popular searches"
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
      >
        <X size={15} color={theme.colors.mutedForeground} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 9,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  title: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  chipScroll: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 160,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dismiss: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.7,
  },
});
