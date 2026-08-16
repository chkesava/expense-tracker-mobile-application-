import { Text, type StyleProp, type TextStyle } from "react-native";

import { useSettings } from "@/providers/SettingsProvider";

export function NutritionValue({
  value,
  unit,
  digits = 0,
  style,
}: {
  value: number;
  unit?: string;
  digits?: number;
  style?: StyleProp<TextStyle>;
}) {
  const { settings } = useSettings();
  if (settings.ghostMode) {
    return (
      <Text accessibilityLabel="Hidden amount" style={style}>
        ••••
      </Text>
    );
  }
  const formatted =
    digits > 0 ? value.toFixed(digits) : String(Math.round(value));
  return (
    <Text style={style}>
      {formatted}
      {unit ? ` ${unit}` : ""}
    </Text>
  );
}
