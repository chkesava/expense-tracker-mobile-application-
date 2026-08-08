import { useState } from "react";
import { StyleSheet, TextInput, View, Text, type TextInputProps } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
};

export function Input({ label, error, style, onFocus, onBlur, ...props }: InputProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.destructive
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.xs,
            fontFamily: theme.fontFamily.semibold,
            marginBottom: theme.space.xs,
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.colors.mutedForeground}
        accessibilityLabel={label ?? props.placeholder}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            borderWidth: 1.5,
            borderColor,
            backgroundColor: theme.colors.card,
            color: theme.colors.foreground,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.space.lg,
            paddingVertical: theme.space.md,
            fontSize: theme.typography.md,
            fontFamily: theme.fontFamily.regular,
            minHeight: 48,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text
          style={{
            color: theme.colors.destructive,
            fontSize: theme.typography.xs,
            marginTop: theme.space.xs,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
});
