import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  helperText?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export function Input({
  label,
  error,
  helperText,
  leadingIcon,
  trailingIcon,
  style,
  containerStyle,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  const isError = Boolean(error);
  const borderColor = isError
    ? theme.colors.destructive
    : focused
      ? theme.colors.primary
      : theme.colors.outline ?? theme.colors.border;

  const borderWidth = focused || isError ? 2 : 1;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text
          style={[
            styles.label,
            {
              color: isError
                ? theme.colors.destructive
                : focused
                  ? theme.colors.primary
                  : theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.medium,
            },
          ]}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputContainer,
          {
            borderColor,
            borderWidth,
            backgroundColor: theme.colors.card,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        {leadingIcon ? <View style={styles.iconSlot}>{leadingIcon}</View> : null}

        <TextInput
          placeholderTextColor={theme.colors.mutedForeground}
          accessibilityLabel={label ?? props.placeholder}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.textInput,
            {
              color: theme.colors.foreground,
              fontSize: theme.typography.md,
              fontFamily: theme.fontFamily.regular,
            },
            style,
          ]}
          {...props}
        />

        {trailingIcon ? <View style={styles.iconSlot}>{trailingIcon}</View> : null}
      </View>

      {error ? (
        <Text
          style={[
            styles.helperText,
            {
              color: theme.colors.destructive,
              fontFamily: theme.fontFamily.medium,
            },
          ]}
        >
          {error}
        </Text>
      ) : helperText ? (
        <Text
          style={[
            styles.helperText,
            {
              color: theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.regular,
            },
          ]}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 4,
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.2,
    marginLeft: 2,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  textInput: {
    flex: 1,
    paddingVertical: 12,
    minHeight: 48,
  },
  iconSlot: {
    marginHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  helperText: {
    fontSize: 12,
    marginTop: 2,
    marginLeft: 4,
  },
});
