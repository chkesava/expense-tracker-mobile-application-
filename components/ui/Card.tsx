import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

import { useTheme } from "@/theme/ThemeProvider";

export type CardVariant = "outlined" | "elevated" | "filled";

export type CardProps = {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  title,
  subtitle,
  headerRight,
  variant = "outlined",
  style,
}: CardProps) {
  const { theme } = useTheme();

  const backgroundColor =
    variant === "filled" ? theme.colors.surfaceVariant : theme.colors.card;
  const borderWidth = variant === "outlined" ? 1 : 0;
  const elevationStyle = variant === "elevated" ? theme.elevation[1] : undefined;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor: theme.colors.border,
          borderWidth,
          borderRadius: theme.radius.lg,
          padding: theme.space.lg,
        },
        elevationStyle,
        style,
      ]}
    >
      {title || headerRight ? (
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            {title ? (
              <Text
                style={{
                  color: theme.colors.cardForeground,
                  fontSize: theme.typography.lg,
                  fontFamily: theme.fontFamily.bold,
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
          </View>
          {headerRight ? <View style={styles.headerRightWrap}>{headerRight}</View> : null}
        </View>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerRightWrap: {
    marginLeft: 8,
  },
});
