import React, { useEffect, useRef, useState } from "react";
import { StyleProp, Text, TextStyle } from "react-native";
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { formatAmount } from "@/shared/utils/formatCurrency";

export interface AnimatedCounterProps {
  value: number;
  currency?: string;
  prefix?: string;
  fractionDigits?: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
  formatter?: (val: number) => string;
  accessibilityLabel?: string;
}

export function AnimatedCounter({
  value,
  currency = "INR",
  prefix,
  fractionDigits,
  duration = 600,
  style,
  formatter,
  accessibilityLabel,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState<number>(() => value);
  const animValue = useSharedValue(value);
  const prevTargetRef = useRef(value);

  useEffect(() => {
    const startVal = prevTargetRef.current;
    prevTargetRef.current = value;

    if (startVal === value) {
      animValue.value = value;
      setDisplayValue(value);
      return;
    }

    animValue.value = startVal;
    animValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, animValue]);

  useAnimatedReaction(
    () => animValue.value,
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplayValue)(current);
      }
    },
    [animValue]
  );

  const formattedText = formatter
    ? formatter(displayValue)
    : formatAmount(displayValue, currency, { prefix, fractionDigits });

  return (
    <Text
      accessibilityLabel={accessibilityLabel || `Amount ${value}`}
      style={[{ fontVariant: ["tabular-nums"] }, style]}
    >
      {formattedText}
    </Text>
  );
}

export default AnimatedCounter;
