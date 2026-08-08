import { View, Text, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import Animated, { FadeInDown } from "react-native-reanimated";

export type EmptyStateProps = {
  icon?: ReactNode;
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  animated?: boolean;
};

export function EmptyState({ 
  icon, 
  emoji,
  title, 
  description, 
  action, 
  secondaryAction,
  animated = true 
}: EmptyStateProps) {
  const { theme } = useTheme();

  const Container = animated ? Animated.View : View;
  const containerProps = animated ? { entering: FadeInDown.duration(500) } : {};

  return (
    <Container
      style={[
        styles.wrap,
        {
          padding: theme.space.xl,
          gap: theme.space.sm,
        },
      ]}
      accessibilityRole="summary"
      {...containerProps as any}
    >
      {emoji ? (
        <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>
          {emoji}
        </Text>
      ) : null}
      {icon && !emoji ? <View style={styles.iconContainer}>{icon}</View> : null}
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
      {secondaryAction ? <View style={{ marginTop: theme.space.sm }}>{secondaryAction}</View> : null}
    </Container>
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
