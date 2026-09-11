import { Pressable, StyleSheet, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";

export type ActionMenuItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export type ActionMenuSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  actions: ActionMenuItem[];
};

/** Bottom-sheet action menu (Buy / Sell / Delete, overflow menus). */
export function ActionMenuSheet({ isOpen, onClose, title, actions }: ActionMenuSheetProps) {
  const { theme } = useTheme();

  const handleSelect = (action: ActionMenuItem) => {
    if (action.disabled) return;
    void haptic.selection();
    onClose();
    // Defer so the sheet can close before opening another modal/dialog.
    const defer =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb: () => void) => setTimeout(cb, 0);
    defer(() => {
      action.onPress();
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxHeight="55%">
      <View style={[styles.list, { gap: theme.space.sm }]}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => handleSelect(action)}
            disabled={action.disabled}
            android_ripple={{ color: theme.colors.primary + "18" }}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                borderCurve: "continuous",
                opacity: action.disabled ? 0.45 : pressed ? 0.85 : 1,
                backgroundColor: action.destructive
                  ? theme.colors.destructive + "12"
                  : theme.colors.muted,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: !!action.disabled }}
          >
            <Text
              style={{
                color: action.destructive ? theme.colors.destructive : theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
                fontSize: 16,
              }}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 8,
  },
  row: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
