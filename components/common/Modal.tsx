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
import * as Haptics from "expo-haptics";
import Animated, { SlideInDown } from "react-native-reanimated";

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
  maxHeight = "88%",
}: ModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const insets = useSafeAreaInsets();

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onClose();
  };

  return (
    <RNModal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/*
        Hit-testing layout (important on Android):
        - Root is a plain View (not KeyboardAvoidingView / AnimatedPressable).
        - Backdrop is a separate absolute Pressable underneath the sheet.
        - Sheet sits above with zIndex/elevation so Edit/Delete buttons receive taps.
      */}
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          style={[
            styles.backdrop,
            {
              backgroundColor: isDark
                ? "rgba(0,0,0,0.72)"
                : "rgba(15,23,42,0.55)",
            },
          ]}
          onPress={handleClose}
          accessibilityLabel="Close modal overlay"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetAvoider}
          pointerEvents="box-none"
        >
          <Animated.View
            entering={SlideInDown.springify().damping(22).stiffness(240)}
            pointerEvents="auto"
            style={[
              styles.sheetCard,
              theme.elevation[4],
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                borderTopLeftRadius: theme.radius.sheet ?? 28,
                borderTopRightRadius: theme.radius.sheet ?? 28,
                paddingBottom: Math.max(insets.bottom, 16),
                maxHeight:
                  typeof maxHeight === "number" ? maxHeight : undefined,
              },
            ]}
          >
            <View style={styles.dragHandleContainer}>
              <View
                style={[
                  styles.dragHandle,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.25)"
                      : "rgba(0,0,0,0.2)",
                  },
                ]}
              />
            </View>

            {title ? (
              <View
                style={[
                  styles.header,
                  { borderBottomColor: theme.colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.title,
                    {
                      color: theme.colors.foreground,
                      fontFamily: theme.fontFamily.bold,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>

                <Pressable
                  onPress={handleClose}
                  android_ripple={{
                    color: theme.colors.primary + "20",
                    borderless: true,
                    radius: 20,
                  }}
                  style={({ pressed }) => [
                    styles.closeButton,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.05)",
                    },
                    Platform.OS === "ios" && pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel="Close modal"
                  accessibilityRole="button"
                >
                  <X size={18} color={theme.colors.mutedForeground} />
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="always"
              bounces={false}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
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
    ...StyleSheet.absoluteFillObject,
  },
  sheetAvoider: {
    width: "100%",
    zIndex: 2,
  },
  sheetCard: {
    width: "100%",
    borderTopWidth: 1,
    overflow: "hidden",
    zIndex: 2,
    elevation: 8,
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  dragHandle: {
    width: 36,
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
    fontSize: 18,
    letterSpacing: -0.3,
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
});
