import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from "react-native-reanimated";

interface SplashAnimationOverlayProps {
  onAnimationComplete: () => void;
}

export function SplashAnimationOverlay({
  onAnimationComplete,
}: SplashAnimationOverlayProps) {
  const containerOpacity = useSharedValue(1);
  const containerScale = useSharedValue(1);
  const logoScale = useSharedValue(0.82);
  const logoOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.7);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    // 1. Logo Fade In & Spring Bounce (starts immediately)
    logoOpacity.value = withTiming(1.0, {
      duration: 380,
      easing: Easing.out(Easing.cubic),
    });

    logoScale.value = withSequence(
      withSpring(1.06, {
        stiffness: 180,
        damping: 12,
        mass: 0.8,
      }),
      withSpring(1.0, {
        stiffness: 160,
        damping: 14,
      })
    );

    // 2. Subtle ambient pulse glow behind the logo
    glowOpacity.value = withSequence(
      withTiming(0.4, { duration: 400 }),
      withTiming(0.15, { duration: 400 })
    );
    glowScale.value = withTiming(1.2, {
      duration: 800,
      easing: Easing.out(Easing.ease),
    });

    // 3. Complete ~800ms sequence and smoothly fade out overlay to reveal destination
    const timer = setTimeout(() => {
      containerScale.value = withTiming(1.04, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
      containerOpacity.value = withTiming(
        0,
        {
          duration: 350,
          easing: Easing.out(Easing.cubic),
        },
        (isFinished) => {
          if (isFinished) {
            runOnJS(onAnimationComplete)();
          }
        }
      );
    }, 750);

    return () => clearTimeout(timer);
  }, [
    logoScale,
    logoOpacity,
    glowScale,
    glowOpacity,
    containerScale,
    containerOpacity,
    onAnimationComplete,
  ]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      pointerEvents="none"
    >
      {/* Ambient glowing circle */}
      <Animated.View style={[styles.glowCircle, glowStyle]} />

      {/* Centered App Logo */}
      <Animated.Image
        source={require("../../assets/branding/splash-logo.png")}
        style={[styles.logo, logoStyle]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0F2F4B",
    zIndex: 99999, // Render on top of navigation stack
    alignItems: "center",
    justifyContent: "center",
  },
  glowCircle: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(107, 99, 255, 0.35)",
  },
  logo: {
    width: 220,
    height: 220,
  },
});
