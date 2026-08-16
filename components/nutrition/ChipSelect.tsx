import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>;
  value: T | undefined;
  onChange: (next: T) => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected
                  ? theme.colors.primary
                  : theme.colors.secondary,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                borderCurve: "continuous",
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={{
                color: selected
                  ? theme.colors.primaryForeground
                  : theme.colors.secondaryForeground,
                fontFamily: selected
                  ? theme.fontFamily.bold
                  : theme.fontFamily.medium,
                fontSize: theme.typography.sm,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
