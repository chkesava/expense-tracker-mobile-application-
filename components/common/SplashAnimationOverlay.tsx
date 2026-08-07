import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

interface SplashAnimationOverlayProps {
  onAnimationComplete: () => void;
}

export function SplashAnimationOverlay({ onAnimationComplete }: SplashAnimationOverlayProps) {
  const containerOpacity = useSharedValue(1);
  const logoScale = useSharedValue(0.85);
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    // 1. Animate logo scale & opacity simultaneously
    logoScale.value = withSpring(1.0, {
      damping: 12,     // Medium damping for a crisp, responsive bounce
      stiffness: 100,  // Spring stiffness for rapid animation start
    });
    
    logoOpacity.value = withTiming(1.0, { duration: 400 }, () => {
      // 2. Once the logo animation completes, fade out the background container to reveal the app
      containerOpacity.value = withTiming(0, { duration: 350 }, (isFinished) => {
        if (isFinished) {
          runOnJS(onAnimationComplete)();
        }
      });
    });
  }, [logoScale, logoOpacity, containerOpacity, onAnimationComplete]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
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
    zIndex: 99999, // Ensure it mounts on top of navigation stack
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 250,
    height: 250,
  },
});
