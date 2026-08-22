import React, { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface SearchFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}

/** The primary control on Search & Lab — large target, clear focus accent. */
export function SearchField({
  value,
  onChangeText,
  placeholder = "Search by note, category, tag, account or amount...",
}: SearchFieldProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: surface.card,
          borderColor: focused
            ? isDark
              ? "rgba(244, 63, 94, 0.5)"
              : "rgba(220, 38, 38, 0.35)"
            : surface.border,
        },
      ]}
    >
      <Search
        size={19}
        color={focused ? accents.pink : theme.colors.mutedForeground}
        strokeWidth={2.2}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Search transactions"
        style={[styles.input, { color: theme.colors.foreground }]}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
        >
          <X size={16} color={theme.colors.mutedForeground} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 6,
    minHeight: 52,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 14.5,
    fontWeight: "500",
    paddingVertical: 12,
  },
  clearBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  pressed: {
    opacity: 0.6,
  },
});
