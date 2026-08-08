import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Search, X } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";

export type SearchBarProps = Omit<TextInputProps, "style"> & {
  value: string;
  onChangeText: (text: string) => void;
};

/** MD3 search field — pill shape, leading icon, clear button, elevates on focus. */
export function SearchBar({ value, onChangeText, placeholder, onFocus, onBlur, ...props }: SearchBarProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        focused ? theme.elevation[1] : undefined,
        {
          backgroundColor: theme.colors.surfaceVariant,
          borderRadius: theme.radius.full,
          borderColor: focused ? theme.colors.primary : "transparent",
        },
      ]}
    >
      <Search size={theme.iconSize.md} color={theme.colors.onSurfaceVariant} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
        accessibilityLabel={placeholder ?? "Search"}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          flex: 1,
          color: theme.colors.foreground,
          fontSize: theme.typography.md,
          fontFamily: theme.fontFamily.regular,
          paddingVertical: 0,
        }}
        {...props}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
        >
          <X size={theme.iconSize.md} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 16,
    borderWidth: 1.5,
  },
});
