import { Image, Pressable, StyleSheet, Text, type ViewStyle, type StyleProp } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { ACTIVE_PRODUCT } from "@/lib/activeProduct";
import { socialButtonPalette, usesExpenseLook } from "@/lib/authLook";
import { useTheme } from "@/theme/ThemeProvider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SocialLoginButton({
  onPress,
  disabled,
  loading,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // SPENDLY-556: themed for Expense; Nutrition keeps its previous colours.
  const expenseLook = usesExpenseLook(ACTIVE_PRODUCT);
  const palette = socialButtonPalette(theme, expenseLook);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: disabled || loading ? 0.6 : 1,
        },
        style,
        animatedStyle,
      ]}
    >
      {/* Fallback to simple G text if we don't have a local google logo asset handy, 
          though standard best practice is using an SVG/png. We'll use an emoji/text hybrid to guarantee it renders */}
      <Text style={[{ fontSize: 20, marginRight: 8 }, expenseLook && { color: palette.text, fontFamily: theme.fontFamily.semibold }]}>Google</Text>
      <Text
        style={[
          styles.text,
          {
            color: palette.text,
            fontFamily: theme.fontFamily.semibold,
          },
        ]}
      >
        Continue with Google
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 16,
    letterSpacing: 0.2,
  },
});
