import React from "react";
import { type StyleProp, type TextInputProps, type ViewStyle, View } from "react-native";
import { Input as GluestackInput, InputField as GluestackInputField, InputSlot as GluestackInputSlot } from "@/components/ui/input/index";
import { FormControl as GluestackFormControl, FormControlLabel as GluestackFormControlLabel, FormControlLabelText as GluestackFormControlLabelText, FormControlError as GluestackFormControlError, FormControlErrorText as GluestackFormControlErrorText, FormControlHelper as GluestackFormControlHelper, FormControlHelperText as GluestackFormControlHelperText } from "@/components/ui/form-control/index";

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
  editable,
  ...props
}: InputProps) {
  const isInvalid = Boolean(error);
  const isDisabled = editable === false;

  return (
    <GluestackFormControl isInvalid={isInvalid} isDisabled={isDisabled} style={containerStyle as any}>
      {label && (
        <GluestackFormControlLabel className="mb-1">
          <GluestackFormControlLabelText>{label}</GluestackFormControlLabelText>
        </GluestackFormControlLabel>
      )}
      
      <GluestackInput className="min-h-[52px]">
        {leadingIcon && (
          <GluestackInputSlot className="pl-3">
            {leadingIcon}
          </GluestackInputSlot>
        )}
        <GluestackInputField
          onFocus={onFocus as any}
          onBlur={onBlur as any}
          editable={editable}
          style={style as any}
          {...props}
        />
        {trailingIcon && (
          <GluestackInputSlot className="pr-3">
            {trailingIcon}
          </GluestackInputSlot>
        )}
      </GluestackInput>

      {error ? (
        <GluestackFormControlError>
          <GluestackFormControlErrorText>{error}</GluestackFormControlErrorText>
        </GluestackFormControlError>
      ) : helperText ? (
        <GluestackFormControlHelper>
          <GluestackFormControlHelperText>{helperText}</GluestackFormControlHelperText>
        </GluestackFormControlHelper>
      ) : null}
    </GluestackFormControl>
  );
}
