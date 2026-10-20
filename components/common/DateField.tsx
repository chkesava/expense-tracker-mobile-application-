import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { CalendarDays } from "lucide-react-native";

import { DatePickerPanel } from "@/components/common/DatePickerPanel";
import {
  FormControl as GluestackFormControl,
  FormControlError as GluestackFormControlError,
  FormControlErrorText as GluestackFormControlErrorText,
  FormControlHelper as GluestackFormControlHelper,
  FormControlHelperText as GluestackFormControlHelperText,
  FormControlLabel as GluestackFormControlLabel,
  FormControlLabelText as GluestackFormControlLabelText,
} from "@/components/ui/form-control/index";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { isValidDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

export type DateFieldProps = {
  label?: string;
  /** A `YYYY-MM-DD` key, or "" when empty. Stored exactly as before. */
  value: string;
  onChange: (date: string) => void;
  /** Earliest / latest pickable `YYYY-MM-DD`. Mirrors an existing rule; validation still runs. */
  minDate?: string;
  maxDate?: string;
  /** Optional field: the picker offers Clear, which sets "". */
  clearable?: boolean;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * SPENDLY-557: the date input for every Expense form. Shows the date in the
 * user's date format and opens `DatePickerPanel` inline; nothing is typed. The label,
 * helper and error use the same form-control parts as `ui/Input`, and the box
 * matches its border, radius and 52dp height.
 */
export function DateField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  clearable = false,
  placeholder = "Pick a date",
  error,
  helperText,
  disabled = false,
  accessibilityLabel,
  containerStyle,
}: DateFieldProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const shown = value && isValidDateKey(value) ? formatDisplayDate(value, settings?.dateFormat) : value;
  const name = accessibilityLabel ?? label ?? "Date";

  return (
    <GluestackFormControl isInvalid={Boolean(error)} isDisabled={disabled} style={containerStyle as never}>
      {label ? (
        <GluestackFormControlLabel className="mb-1">
          <GluestackFormControlLabelText style={{ fontFamily: theme.fontFamily.medium }}>{label}</GluestackFormControlLabelText>
        </GluestackFormControlLabel>
      ) : null}
      <Pressable
        onPress={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${shown || "not set"}. ${disabled ? "Unavailable" : "Change date"}`}
        accessibilityState={{ expanded: open, disabled }}
        style={({ pressed }) => [
          styles.box,
          {
            borderColor: error ? theme.colors.destructive : theme.colors.border,
            borderRadius: theme.radius.md,
            opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: shown ? theme.colors.foreground : theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }}
        >
          {shown || placeholder}
        </Text>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <CalendarDays size={18} color={theme.colors.mutedForeground} />
        </View>
      </Pressable>
      {open ? (
        <DatePickerPanel
          isOpen={open}
          value={value}
          min={minDate}
          max={maxDate}
          clearable={clearable}
          onPick={(date) => {
            setOpen(false);
            onChange(date);
          }}
          onClear={() => {
            setOpen(false);
            onChange("");
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {error ? (
        <GluestackFormControlError>
          <GluestackFormControlErrorText style={{ fontFamily: theme.fontFamily.medium }}>{error}</GluestackFormControlErrorText>
        </GluestackFormControlError>
      ) : helperText ? (
        <GluestackFormControlHelper>
          <GluestackFormControlHelperText style={{ fontFamily: theme.fontFamily.regular }}>{helperText}</GluestackFormControlHelperText>
        </GluestackFormControlHelper>
      ) : null}
    </GluestackFormControl>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 52, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
});
