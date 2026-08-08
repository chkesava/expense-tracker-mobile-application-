import React, { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const CONFETTI_COLORS = [
  "#6366F1", // Indigo
  "#EAB308", // Gold
  "#10B981", // Emerald
  "#EC4899", // Pink/Rose
  "#8B5CF6", // Violet
  "#06B6D4", // Cyan
  "#F97316", // Amber/Orange
];

interface ParticleProps {
  index: number;
  originX: number;
  originY: number;
  color: string;
  size: number;
  isCircle: boolean;
}

function ConfettiParticle({
  index,
  originX,
  originY,
  color,
  size,
  isCircle,
}: ParticleProps) {
  const progress = useSharedValue(0);

  // Deterministic pseudo-random values derived from particle index
  const angle = ((index * 37) % 360) * (Math.PI / 180);
  const velocity = 120 + ((index * 29) % 180);
  const targetX = Math.cos(angle) * velocity + (((index * 17) % 60) - 30);
  const targetY =
    Math.sin(angle) * (velocity * 0.7) +
    180 +
    ((index * 31) % 140); // gravity pull downwards
  const targetRotate = (index % 2 === 0 ? 1 : -1) * (360 + ((index * 47) % 540));
  const delay = (index % 8) * 25;
  const duration = 1200 + ((index * 23) % 400);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const currentX = targetX * p;
    const currentY = targetY * p + 80 * p * p; // quadratic gravity arc
    const currentRotation = `${targetRotate * p}deg`;
    const opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3; // fade out smoothly in last 30%
    const scale = p < 0.15 ? p / 0.15 : Math.max(0.4, 1 - (p - 0.15) * 0.4);

    return {
      transform: [
        { translateX: currentX },
        { translateY: currentY },
        { rotateZ: currentRotation },
        { scale },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: originX,
          top: originY,
          width: size,
          height: isCircle ? size : size * 1.6,
          borderRadius: isCircle ? size / 2 : 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
      pointerEvents="none"
    />
  );
}

export interface ConfettiCannonProps {
  count?: number;
  origin?: { x: number; y: number };
}

export function ConfettiCannon({ count = 40, origin }: ConfettiCannonProps) {
  const { width, height } = useWindowDimensions();
  const originX = origin ? origin.x : width / 2;
  const originY = origin ? origin.y : height * 0.35;

  const particles = Array.from({ length: count }, (_, i) => ({
    key: `confetti-${i}`,
    index: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + (i % 5) * 2,
    isCircle: i % 3 === 0,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiParticle
          key={p.key}
          index={p.index}
          originX={originX}
          originY={originY}
          color={p.color}
          size={p.size}
          isCircle={p.isCircle}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: "absolute",
  },
});
