import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export type ListItemProps = {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  dense?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** MD3 list item — leading icon/avatar slot, 1–2 line text, trailing slot. */
export function ListItem({ leading, title, subtitle, trailing, onPress, dense, style }: ListItemProps) {
  const { theme } = useTheme();
  const Container = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.row,
        {
          minHeight: dense ? 56 : 72,
          paddingHorizontal: theme.space.lg,
          paddingVertical: theme.space.sm,
          gap: theme.space.md,
          backgroundColor: onPress && pressed ? theme.colors.surfaceVariant : "transparent",
        },
        style,
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.textWrap}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.foreground,
            fontSize: theme.type.bodyLarge.fontSize,
            lineHeight: theme.type.bodyLarge.lineHeight,
            fontFamily: theme.fontFamily.medium,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.type.bodyMedium.fontSize,
              lineHeight: theme.type.bodyMedium.lineHeight,
              fontFamily: theme.type.bodyMedium.fontFamily,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Container>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    justifyContent: "center",
  },
  trailing: {
    alignItems: "center",
    justifyContent: "center",
  },
});
