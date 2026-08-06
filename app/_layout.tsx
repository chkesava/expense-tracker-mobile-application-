import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { CelebrationOverlay } from "@/components/common/CelebrationOverlay";
import { ToastProvider } from "@/lib/toast";
import { AuthProvider } from "@/providers/AuthProvider";
import { CelebrationProvider } from "@/providers/CelebrationProvider";
import { SettingsProvider } from "@/providers/SettingsProvider";
import { SystemSettingsProvider } from "@/providers/SystemSettingsProvider";
import { UserDocProvider } from "@/providers/UserDocProvider";
import { AppThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export { ErrorBoundary } from "expo-router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

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
        <QueryClientProvider client={queryClient}>
          <SystemSettingsProvider>
            <AuthProvider>
              <UserDocProvider>
                <AppThemeProvider>
                  <SettingsProvider>
                    <CelebrationProvider>
                      <ToastProvider>
                        <RootNavigator />
                        <CelebrationOverlay />
                      </ToastProvider>
                    </CelebrationProvider>
                  </SettingsProvider>
                </AppThemeProvider>
              </UserDocProvider>
            </AuthProvider>
          </SystemSettingsProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { theme, themeName } = useTheme();

  return (
    <>
      <StatusBar style={themeUsesDarkPalette(themeName) ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="google-auth" options={{ animation: "none" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
