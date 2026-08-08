import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { CheckCircle2 } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { durations } from "@/theme/motion";

export type SuccessStateProps = {
  title: string;
  description?: string;
};

export function SuccessState({ title, description }: SuccessStateProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrap, { padding: theme.space.xl, gap: theme.space.sm }]}>
      <Animated.View entering={ZoomIn.duration(durations.extraLong)}>
        <CheckCircle2 size={theme.iconSize.xl} color={theme.colors.success} strokeWidth={1.75} />
      </Animated.View>
      <Animated.View entering={FadeIn.duration(durations.extraLong).delay(durations.medium)}>
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
