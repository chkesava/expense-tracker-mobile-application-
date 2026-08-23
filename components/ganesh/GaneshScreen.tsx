import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";

export function GaneshScreen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: Math.max(insets.bottom, 16) + 24,
    gap: 16,
  };

  if (!scroll) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background, ...padding }]}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: theme.colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={padding}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
