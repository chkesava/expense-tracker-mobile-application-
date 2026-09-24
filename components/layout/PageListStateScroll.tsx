import type { ReactNode } from "react";
import { ScrollView, type StyleProp, type ViewStyle } from "react-native";

import { usePageListBottomPadding } from "./usePageListBottomPadding";

/**
 * Scroll wrapper for the empty / error / loading states of a list screen, so
 * they can scroll clear of the floating BottomNav + FAB on short devices.
 */
export function PageListStateScroll({
  children,
  contentContainerStyle,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const bottomPadding = usePageListBottomPadding();
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[contentContainerStyle, { paddingBottom: bottomPadding }]}
    >
      {children}
    </ScrollView>
  );
}
