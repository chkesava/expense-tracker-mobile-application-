import { Pressable, StyleSheet } from "react-native";
import { Pencil } from "lucide-react-native";

type AccountEditButtonProps = {
  label: string;
  color: string;
  onPress: () => void;
};

export function AccountEditButton({
  label,
  color,
  onPress,
}: AccountEditButtonProps) {
  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.hit}
    >
      <Pencil size={16} color={color} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
