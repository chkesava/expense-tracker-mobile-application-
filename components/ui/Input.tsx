import { StyleSheet, TextInput, View, Text, type TextInputProps } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
};

export function Input({ label, error, style, ...props }: InputProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.xs,
            fontWeight: "600",
            marginBottom: theme.space.xs,
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.colors.mutedForeground}
        accessibilityLabel={label ?? props.placeholder}
        style={[
          {
            borderWidth: 1,
            borderColor: error ? theme.colors.destructive : theme.colors.border,
            backgroundColor: theme.colors.card,
            color: theme.colors.foreground,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.space.lg,
            paddingVertical: theme.space.md,
            fontSize: theme.typography.md,
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
