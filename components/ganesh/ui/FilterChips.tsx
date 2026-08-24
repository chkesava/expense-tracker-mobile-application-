import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { DASH_RADIUS } from "@/components/dashboard/primitives";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { useGaneshTokens } from "./tokens";

export type ChipOption<T extends string> = {
  id: T;
  label: string;
  /** Rendered after the label — usually a count. */
  badge?: number | string;
  icon?: ReactNode;
};

export type FilterChipsProps<T extends string> = {
  value: T;
  options: Array<ChipOption<T>>;
  onChange: (value: T) => void;
  label?: string;
  disabled?: boolean;
  disabledIds?: T[];
  /** `scroll` keeps one line and scrolls; `wrap` flows onto multiple lines. */
  layout?: "scroll" | "wrap";
  testID?: string;
};

/**
 * The single chip control for Ganesh Seva.
 *
 * Replaces the four separate implementations that existed before (ChoiceChips,
 * FundLocationChips, an inline ChipRow in Add Collection, and hand-rolled filter
 * rows in three tab screens). Selection is a washed accent — a solid fill at
 * this size reads as a button and fights the amounts for attention.
 */
export function FilterChips<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  disabledIds,
  layout = "scroll",
  testID,
}: FilterChipsProps<T>) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const chips = options.map((option) => {
    const selected = value === option.id;
    const isDisabled = Boolean(disabled || disabledIds?.includes(option.id));
    const color = selected ? g.saffron : theme.colors.mutedForeground;

    return (
      <Pressable
        key={option.id}
        disabled={isDisabled}
        onPress={() => {
          if (selected) return;
          void haptic.selection();
          onChange(option.id);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected, disabled: isDisabled }}
        accessibilityLabel={option.label}
        android_ripple={{ color: g.wash(g.saffron), borderless: false }}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: selected ? g.wash(g.saffron) : g.tile,
            borderColor: selected ? g.wash(g.saffron) : g.divider,
          },
          isDisabled && !selected && { opacity: 0.45 },
          pressed && { opacity: 0.8 },
        ]}
      >
        {option.icon}
        <Text
          numberOfLines={1}
          style={{
            color,
            fontSize: 13,
            fontFamily: selected ? theme.fontFamily.semibold : theme.fontFamily.medium,
          }}
        >
          {option.label}
        </Text>
        {option.badge !== undefined ? (
          <Text
            style={{
              color,
              fontSize: 12,
              fontFamily: theme.fontFamily.medium,
              fontVariant: ["tabular-nums"],
            }}
          >
            {option.badge}
          </Text>
        ) : null}
      </Pressable>
    );
  });

  return (
    <View style={styles.wrap} testID={testID}>
      {label ? (
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: 11,
            letterSpacing: 0.1,
            fontFamily: theme.fontFamily.medium,
          }}
        >
          {label}
        </Text>
      ) : null}

      {layout === "wrap" ? (
        <View style={styles.wrapRow}>{chips}</View>
      ) : (
        <HorizontalSwipeBoundary>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollRow}
          >
            {chips}
          </ScrollView>
        </HorizontalSwipeBoundary>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  scrollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: DASH_RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
