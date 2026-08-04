import type { StyleProp, TextStyle, ViewStyle } from "react-native";

type StyleLike = StyleProp<ViewStyle | TextStyle> | false | null | undefined;

/** Lightweight style merger (clsx / cn analogue for StyleSheet arrays). */
export function cn(...styles: StyleLike[]): StyleProp<ViewStyle | TextStyle> {
  return styles.filter(Boolean) as StyleProp<ViewStyle | TextStyle>;
}
