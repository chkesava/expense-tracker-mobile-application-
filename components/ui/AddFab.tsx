import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { Plus } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface AddFabProps {
  onPress: () => void;
  size?: "sm" | "md" | "lg";
  withLabel?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function AddFab({
  onPress,
  size = "md",
  withLabel = false,
  label = "Add",
  style,
  accessibilityLabel = "Add transaction",
}: AddFabProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const iconRotation = useSharedValue(0);

  const handlePressIn = () => {
    scale.value = withSpring(0.91, { damping: 12, stiffness: 350 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 300 });
  };

  const handlePress = () => {
    haptic.medium().catch(() => undefined);
    iconRotation.value = withSequence(
      withTiming(45, { duration: 120 }),
      withSpring(0, { damping: 12, stiffness: 200 })
    );
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotation.value}deg` }],
  }));

  const dimensions = {
    sm: { diameter: 40, iconSize: 20 },
    md: { diameter: 48, iconSize: 24 },
    lg: { diameter: 56, iconSize: 28 },
  }[size];

  return (
    <AnimatedPressable
      entering={ZoomIn.springify().damping(15)}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{
        color: "rgba(255, 255, 255, 0.25)",
        borderless: false,
      }}
      style={[
        withLabel ? styles.pillButton : styles.circleButton,
        theme.elevation[3],
        {
          backgroundColor: theme.colors.primary,
        },
        !withLabel && {
          width: dimensions.diameter,
          height: dimensions.diameter,
          borderRadius: dimensions.diameter / 2,
        },
        style,
        animatedStyle,
      ]}
    >
      <Animated.View style={iconAnimatedStyle}>
        <Plus size={dimensions.iconSize} color={theme.colors.primaryForeground} strokeWidth={2.5} />
      </Animated.View>
      {withLabel ? (
        <Text
          style={[
            styles.label,
            {
              color: theme.colors.primaryForeground,
              fontSize: theme.typography.sm,
              fontFamily: theme.fontFamily.semibold,
            },
          ]}
        >
          {label}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

export default AddFab;

const styles = StyleSheet.create({
  circleButton: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
    overflow: "hidden",
  },
  label: {
    fontWeight: "700",
  },
});

