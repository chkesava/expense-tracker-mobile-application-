import React, { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: number | string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = "85%",
}: ModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const insets = useSafeAreaInsets();

  return (
    <RNModal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        {/* Backdrop dismiss */}
        <Pressable
          style={[
            styles.backdrop,
            { backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(15,23,42,0.5)" },
          ]}
          onPress={onClose}
          accessibilityLabel="Close modal overlay"
        />

        {/* Bottom Sheet Card */}
        <View
          style={[
            styles.sheetCard,
            theme.elevation[3],
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderTopLeftRadius: theme.radius.sheet,
              borderTopRightRadius: theme.radius.sheet,
              paddingBottom: Math.max(insets.bottom, 16),
              maxHeight: typeof maxHeight === "number" ? maxHeight : undefined,
            },
          ]}
        >
          {/* Drag pill handle */}
          <View style={styles.dragHandleContainer}>
            <View
              style={[
                styles.dragHandle,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.2)"
                    : "rgba(0,0,0,0.15)",
                },
              ]}
            />
          </View>

          {/* Header */}
          <View
            style={[
              styles.header,
              { borderBottomColor: theme.colors.border },
            ]}
          >
            {title ? (
              <Text
                style={[
                  styles.title,
                  {
                    color: theme.colors.foreground,
                    fontSize: theme.typography.lg,
                    fontFamily: theme.fontFamily.bold,
                  },
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.05)",
                },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel="Close modal"
              accessibilityRole="button"
            >
              <X size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Body Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

export default Modal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetCard: {
    width: "100%",
    borderWidth: 1,
    overflow: "hidden",
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontWeight: "800",
    letterSpacing: -0.3,
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
  },
});
