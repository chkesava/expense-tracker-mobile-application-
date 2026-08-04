import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

import { useTheme } from "@/theme/ThemeProvider";

export type CardProps = {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, title, subtitle, style }: CardProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.space.lg,
        },
        style,
      ]}
    >
      {title ? (
        <Text
          style={{
            color: theme.colors.cardForeground,
            fontSize: theme.typography.lg,
            fontWeight: "800",
            marginBottom: subtitle ? theme.space.xs : theme.space.md,
          }}
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            marginBottom: theme.space.md,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    width: "100%",
  },
});
