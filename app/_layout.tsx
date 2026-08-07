import { useEffect, useState } from "react";
import { Stack, useNavigationContainerRef } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-reanimated";

import { CelebrationOverlay } from "@/components/common/CelebrationOverlay";
import { SplashAnimationOverlay } from "@/components/common/SplashAnimationOverlay";
import { ToastProvider } from "@/lib/toast";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { CelebrationProvider } from "@/providers/CelebrationProvider";
import { SettingsProvider, useSettings } from "@/providers/SettingsProvider";
import { SystemSettingsProvider } from "@/providers/SystemSettingsProvider";
import { UserDocProvider, useUserDoc } from "@/providers/UserDocProvider";
import { WorkspaceProvider } from "@/providers/WorkspaceProvider";
import { AppThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette, THEME_STORAGE_KEY } from "@/theme/tokens";

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

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { loading: authLoading } = useAuth();
  const { loading: settingsLoading } = useSettings();
  const { loading: userDocLoading } = useUserDoc();
  const [secureStoreLoaded, setSecureStoreLoaded] = useState(false);
  const [themeStorageLoaded, setThemeStorageLoaded] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  // 1. Wait for Secure Store (Biometric check)
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync("vault_biometric_id")
      .then(() => {
        if (!cancelled) setSecureStoreLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setSecureStoreLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Wait for AsyncStorage Theme configuration loading
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(() => {
        if (!cancelled) setThemeStorageLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setThemeStorageLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 3. Monitor Navigation container readiness
  const navigationRef = useNavigationContainerRef();
  useEffect(() => {
    if (navigationRef?.isReady()) {
      setNavigationReady(true);
      return;
    }
    const interval = setInterval(() => {
      if (navigationRef?.isReady()) {
        setNavigationReady(true);
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [navigationRef]);

  // 4. Combined readiness check
  useEffect(() => {
    if (
      !authLoading &&
      !settingsLoading &&
      !userDocLoading &&
      secureStoreLoaded &&
      themeStorageLoaded &&
      navigationReady
    ) {
      setAppIsReady(true);
    }
  }, [authLoading, settingsLoading, userDocLoading, secureStoreLoaded, themeStorageLoaded, navigationReady]);

  // 5. Hide native splash screen
  useEffect(() => {
    if (appIsReady) {
      // Hide the native splash screen instantly, since SplashAnimationOverlay is now mounted
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [appIsReady]);

  return (
    <>
      {children}
      {!animationComplete && appIsReady && (
        <SplashAnimationOverlay
          onAnimationComplete={() => setAnimationComplete(true)}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SystemSettingsProvider>
            <AuthProvider>
              <UserDocProvider>
                <WorkspaceProvider>
                  <AppThemeProvider>
                    <SettingsProvider>
                      <CelebrationProvider>
                        <ToastProvider>
                          <AppInitializer>
                            <RootNavigator />
                            <CelebrationOverlay />
                          </AppInitializer>
                        </ToastProvider>
                      </CelebrationProvider>
                    </SettingsProvider>
                  </AppThemeProvider>
                </WorkspaceProvider>
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
        <Stack.Screen name="(nutrition)" />
        <Stack.Screen name="google-auth" options={{ animation: "none" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
