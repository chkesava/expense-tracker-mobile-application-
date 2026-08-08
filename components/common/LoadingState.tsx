import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export type LoadingStateProps = {
  label?: string;
};

/** Centered spinner for full-section/screen loading (row-level use Skeleton instead). */
export function LoadingState({ label }: LoadingStateProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrap, { padding: theme.space.xl, gap: theme.space.sm }]}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      {label ? (
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            fontFamily: theme.fontFamily.regular,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
