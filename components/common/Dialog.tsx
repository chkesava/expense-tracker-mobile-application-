import type { ReactNode } from "react";
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { useTheme } from "@/theme/ThemeProvider";

export type DialogAction = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "destructive" | "ghost";
};

export type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: DialogAction[];
};

/** MD3 alert dialog — centered, for confirm/alert-style prompts. */
export function Dialog({ isOpen, onClose, title, description, children, actions }: DialogProps) {
  const { theme } = useTheme();

  return (
    <RNModal visible={isOpen} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: theme.colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close dialog overlay" />
        <View
          style={[
            styles.card,
            theme.elevation[3],
            {
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.xl,
              padding: theme.space.xl,
            },
          ]}
        >
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: theme.type.titleMedium.fontSize,
              lineHeight: theme.type.titleMedium.lineHeight,
              fontFamily: theme.type.titleMedium.fontFamily,
              marginBottom: description || children ? theme.space.sm : theme.space.lg,
            }}
          >
            {title}
          </Text>
          {description ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.type.bodyMedium.fontSize,
                lineHeight: theme.type.bodyMedium.lineHeight,
                fontFamily: theme.type.bodyMedium.fontFamily,
                marginBottom: theme.space.lg,
              }}
            >
              {description}
            </Text>
          ) : null}
          {children}
          {actions?.length ? (
            <View style={[styles.actions, { gap: theme.space.sm, marginTop: theme.space.md }]}>
              {actions.map((action) => (
                <Button key={action.label} variant={action.variant ?? "ghost"} onPress={action.onPress}>
                  {action.label}
                </Button>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
