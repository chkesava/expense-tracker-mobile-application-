import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";

export interface AddFabProps {
  onPress: () => void;
  size?: "sm" | "md" | "lg";
  withLabel?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function AddFab({
  onPress,
  size = "md",
  withLabel = false,
  label = "Add",
  style,
  accessibilityLabel = "Add transaction",
}: AddFabProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    onPress();
  };

  const dimensions = {
    sm: { diameter: 40, iconSize: 20 },
    md: { diameter: 48, iconSize: 24 },
    lg: { diameter: 56, iconSize: 28 },
  }[size];

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        withLabel ? styles.pillButton : styles.circleButton,
        {
          backgroundColor: theme.colors.primary,
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
        },
        !withLabel && {
          width: dimensions.diameter,
          height: dimensions.diameter,
          borderRadius: dimensions.diameter / 2,
        },
        pressed && { transform: [{ scale: 0.94 }], opacity: 0.9 },
        style,
      ]}
    >
      <Plus size={dimensions.iconSize} color={theme.colors.primaryForeground} strokeWidth={2.5} />
      {withLabel ? (
        <Text
          style={[
            styles.label,
            { color: theme.colors.primaryForeground, fontSize: theme.typography.sm },
          ]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default AddFab;

const styles = StyleSheet.create({
  circleButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  label: {
    fontWeight: "700",
  },
});
