import { Stack } from "expo-router";
import { View } from "react-native";

import { GaneshStatusBarGap } from "@/components/ganesh/chrome/GaneshStatusBarGap";
import { GaneshThemeProvider } from "@/providers/GaneshThemeProvider";
import { useTheme } from "@/theme/ThemeProvider";

/** Split out so it reads the festival palette rather than the one above it. */
function GaneshAuthStack() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
}

export default function GaneshAuthLayout() {
  return (
    <GaneshThemeProvider>
      <View style={{ flex: 1 }}>
        <GaneshStatusBarGap />
        <GaneshAuthStack />
      </View>
    </GaneshThemeProvider>
  );
}
