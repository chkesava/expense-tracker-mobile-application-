import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Search, X } from "lucide-react-native";

import { withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

const IS_WEB = Platform.OS === "web";

export type SearchBarProps = Omit<TextInputProps, "style"> & {
  value: string;
  onChangeText: (text: string) => void;
  /** Focus-ring colour, for hubs with their own identity accent. Defaults to primary. */
  accentColor?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * MD3 search field — pill shape, leading icon, clear button, elevates on focus.
 *
 * SPENDLY-548: on web the browser drew its own square focus outline on the
 * inner input. That outline is off; focus is the accent border plus a soft
 * ring drawn as a box-shadow on the pill itself, so it follows the radius and
 * keyboard focus stays clearly visible. Native is unchanged.
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onFocus,
  onBlur,
  accentColor,
  containerStyle,
  ...props
}: SearchBarProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const ring = accentColor ?? theme.colors.primary;

  return (
    <View
      style={[
        styles.wrap,
        focused ? theme.elevation[1] : undefined,
        {
          backgroundColor: theme.colors.surfaceVariant,
          borderRadius: theme.radius.full,
          borderColor: focused ? ring : "transparent",
        },
        IS_WEB && focused ? { boxShadow: `0 0 0 3px ${withAlpha(ring, 0.28)}` } : null,
        containerStyle,
      ]}
    >
      <Search size={theme.iconSize.md} color={theme.colors.onSurfaceVariant} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
        accessibilityLabel={placeholder ?? "Search"}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          flex: 1,
          color: theme.colors.foreground,
          fontSize: theme.typography.md,
          fontFamily: theme.fontFamily.regular,
          paddingVertical: 0,
          // The pill shows focus; the browser's own outline would not follow it.
          // `outline-style: auto` paints even at width 0, so the style itself
          // goes (react-native-web accepts "none"; the RN types do not list it).
          ...(IS_WEB ? ({ outlineStyle: "none", outlineWidth: 0 } as unknown as object) : null),
        }}
        {...props}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
        >
          <X size={theme.iconSize.md} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 16,
    borderWidth: 1.5,
  },
});
