import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  disabledIds,
}: {
  label?: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  disabledIds?: T[];
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>{label}</Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const selected = value === option.id;
          const optionDisabled = Boolean(disabled || disabledIds?.includes(option.id));
          return (
            <Pressable
              key={option.id}
              disabled={optionDisabled}
              onPress={() => onChange(option.id)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: selected ? theme.colors.primary : theme.colors.muted,
                opacity: optionDisabled && !selected ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: selected ? theme.colors.primaryForeground : theme.colors.foreground,
                  fontWeight: "700",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
