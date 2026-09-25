import React, { ReactNode } from "react";
import { type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import {
  Button as GluestackButton,
  ButtonText as GluestackButtonText,
  ButtonSpinner as GluestackButtonSpinner
} from "@/components/ui/button/index"; // Import the gluestack implementation
import { haptic as hapticFeedback } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export type ButtonVariant =
  | "primary"
  | "filled"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost"
  | "text"
  | "tonal"
  | "elevated";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  haptic = true,
  disabled,
  onPress,
  style,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  const handlePress = (e: any) => {
    if (isDisabled) return;
    if (haptic) {
      hapticFeedback.light().catch(() => undefined);
    }
    onPress?.(e);
  };

  // Map legacy variants to Gluestack v5 variants
  let mappedVariant: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" = "default";
  
  if (variant === "destructive") mappedVariant = "destructive";
  else if (variant === "outline") mappedVariant = "outline";
  else if (variant === "secondary" || variant === "tonal") mappedVariant = "secondary";
  else if (variant === "ghost" || variant === "text") mappedVariant = "ghost";
  // primary, filled, elevated fall back to 'default'

  let mappedSize: "default" | "sm" | "lg" | "icon" = "default";
  if (size === "sm") mappedSize = "sm";
  else if (size === "lg") mappedSize = "lg";
  else if (size === "icon") mappedSize = "icon";

  // Gluestack's default sizes are desktop-dense (~36dp, rounded-md). Keep the
  // pre-Gluestack Spendly contract — pill shape and 48dp touch targets — so
  // swapping a screen onto Button never shrinks its tap area (SPENDLY-152).
  const sizeStyle: ViewStyle = {
    minHeight: size === "sm" ? 40 : size === "lg" ? 54 : 48,
    minWidth: size === "icon" ? 48 : undefined,
    paddingVertical: size === "lg" ? 14 : size === "md" ? 10 : 8,
    paddingHorizontal: size === "sm" ? 14 : size === "lg" ? 24 : size === "icon" ? 8 : 18,
    borderRadius: theme.radius.full,
  };
  const tonalStyle: ViewStyle | undefined =
    variant === "tonal"
      ? { backgroundColor: theme.colors.secondaryContainer }
      : variant === "elevated"
        ? { backgroundColor: theme.colors.card, ...theme.elevation[1] }
        : undefined;

  const labelColor =
    variant === "text" || variant === "ghost" || variant === "outline"
      ? theme.colors.primary
      : variant === "tonal"
        ? theme.colors.onSecondaryContainer
        : undefined;
  const labelStyle: TextStyle = {
    fontSize: size === "sm" ? theme.typography.xs : size === "lg" ? theme.typography.md : theme.typography.sm,
    fontFamily: theme.fontFamily.semibold,
    ...(labelColor ? { color: labelColor } : null),
  };

  return (
    <GluestackButton
      variant={mappedVariant}
      size={mappedSize}
      isDisabled={isDisabled}
      onPress={handlePress}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[sizeStyle, tonalStyle, style] as any}
      {...props}
    >
      {loading && <GluestackButtonSpinner color={labelColor} />}
      {typeof children === "string" ? (
        <GluestackButtonText style={labelStyle} numberOfLines={1}>
          {children}
        </GluestackButtonText>
      ) : (
        children
      )}
    </GluestackButton>
  );
}
