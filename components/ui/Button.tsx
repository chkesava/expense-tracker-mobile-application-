import React, { ReactNode } from "react";
import { type PressableProps, type StyleProp, type ViewStyle, ActivityIndicator } from "react-native";
import {
  Button as GluestackButton,
  ButtonText as GluestackButtonText,
  ButtonSpinner as GluestackButtonSpinner
} from "@/components/ui/button/index"; // Import the gluestack implementation
import { haptic as hapticFeedback } from "@/lib/haptics";

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

  return (
    <GluestackButton
      variant={mappedVariant}
      size={mappedSize}
      isDisabled={isDisabled}
      onPress={handlePress}
      style={style as any}
      {...props}
    >
      {loading && <GluestackButtonSpinner />}
      {typeof children === "string" ? (
        <GluestackButtonText>{children}</GluestackButtonText>
      ) : (
        children
      )}
    </GluestackButton>
  );
}
