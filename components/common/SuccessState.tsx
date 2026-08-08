import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { AnimatedSuccessCheckmark } from "./AnimatedSuccessCheckmark";
import { useTheme } from "@/theme/ThemeProvider";
import { durations } from "@/theme/motion";

export type SuccessStateProps = {
  title: string;
  description?: string;
  size?: number;
};

export function SuccessState({ title, description, size = 64 }: SuccessStateProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrap, { padding: theme.space.xl, gap: theme.space.md }]}>
      <AnimatedSuccessCheckmark size={size} />
      <Animated.View entering={FadeIn.duration(durations.extraLong).delay(150)}>
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: theme.typography.lg,
            fontFamily: theme.fontFamily.bold,
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
              fontFamily: theme.fontFamily.regular,
              textAlign: "center",
              lineHeight: 20,
              marginTop: theme.space.xs,
            }}
          >
            {description}
          </Text>
        ) : null}
      </Animated.View>
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

