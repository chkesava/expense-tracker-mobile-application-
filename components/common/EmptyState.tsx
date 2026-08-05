import { View, Text, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "@/theme/ThemeProvider";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.wrap,
        {
          padding: theme.space.xl,
          gap: theme.space.sm,
        },
      ]}
      accessibilityRole="summary"
    >
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text
        style={{
          color: theme.colors.foreground,
          fontSize: theme.typography.lg,
          fontWeight: "800",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: theme.space.md }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
