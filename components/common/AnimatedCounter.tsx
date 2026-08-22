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
  startFromZero?: boolean;
  style?: StyleProp<TextStyle>;
  formatter?: (val: number) => string;
  accessibilityLabel?: string;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}

export function AnimatedCounter({
  value,
  currency = "INR",
  prefix,
  fractionDigits,
  duration = 650,
  startFromZero = true,
  style,
  formatter,
  accessibilityLabel,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: AnimatedCounterProps) {
  const isFirstMount = useRef(true);
  const [displayValue, setDisplayValue] = useState<number>(() =>
    startFromZero ? 0 : value
  );
  const animValue = useSharedValue(startFromZero ? 0 : value);
  const prevTargetRef = useRef(startFromZero ? 0 : value);

  useEffect(() => {
    const startVal = isFirstMount.current && startFromZero ? 0 : prevTargetRef.current;
    isFirstMount.current = false;
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
  }, [value, duration, animValue, startFromZero]);

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
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
      style={[{ fontVariant: ["tabular-nums"] }, style]}
    >
      {formattedText}
    </Text>
  );
}

export default AnimatedCounter;
