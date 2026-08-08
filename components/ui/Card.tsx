import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ReactNode } from "react";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/theme/ThemeProvider";

export type CardVariant = "outlined" | "elevated" | "filled" | "tonal";

export type CardProps = {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  variant?: CardVariant;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  title,
  subtitle,
  headerRight,
  variant = "outlined",
  onPress,
  style,
}: CardProps) {
  const { theme } = useTheme();

  const isTonal = variant === "tonal" || variant === "filled";
  const isElevated = variant === "elevated";
  const isOutlined = variant === "outlined";

  const backgroundColor = isTonal
    ? theme.colors.surfaceVariant
    : isElevated
      ? theme.colors.card
      : theme.colors.card;

  const borderColor = isOutlined
    ? theme.colors.outlineVariant ?? theme.colors.border
    : "transparent";
  const borderWidth = isOutlined ? 1 : 0;
  const elevationStyle = isElevated ? theme.elevation[2] : isTonal ? theme.elevation[0] : theme.elevation[1];

  const handlePress = (e: GestureResponderEvent) => {
    if (!onPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress(e);
  };

  const cardContent = (
    <>
      {title || headerRight ? (
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            {title ? (
              <Text
                style={[
                  styles.title,
                  {
                    color: theme.colors.cardForeground,
                    fontFamily: theme.fontFamily.bold,
                  },
                ]}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: theme.colors.mutedForeground,
                    fontFamily: theme.fontFamily.regular,
                  },
                ]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight ? <View style={styles.headerRightWrap}>{headerRight}</View> : null}
        </View>
      ) : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={handlePress}
        android_ripple={{
          color: theme.colors.primary + "18",
          borderless: false,
          foreground: true,
        }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor,
            borderColor,
            borderWidth,
            borderRadius: theme.radius.xl, // 20dp MD3
            padding: theme.space.lg,
            opacity: Platform.OS === "ios" && pressed ? 0.92 : 1,
          },
          elevationStyle,
          style,
        ]}
      >
        {cardContent}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor,
          borderWidth,
          borderRadius: theme.radius.xl,
          padding: theme.space.lg,
        },
        elevationStyle,
        style,
      ]}
    >
      {cardContent}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  headerRightWrap: {
    marginLeft: 8,
  },
});
