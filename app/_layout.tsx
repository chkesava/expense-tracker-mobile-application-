import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { ToastProvider } from "@/lib/toast";
import { AuthProvider } from "@/providers/AuthProvider";
import { SystemSettingsProvider } from "@/providers/SystemSettingsProvider";
import { AppThemeProvider, useTheme } from "@/theme/ThemeProvider";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* splash may already be hidden in fast refresh */
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <ToastProvider>
            <SystemSettingsProvider>
              <AuthProvider>
                <RootNavigator />
              </AuthProvider>
            </SystemSettingsProvider>
          </ToastProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { theme, themeName } = useTheme();

  return (
    <>
      <StatusBar style={themeName === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
