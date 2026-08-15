import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Stack, useNavigationContainerRef } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import "react-native-reanimated";

import { CelebrationOverlay } from "@/components/common/CelebrationOverlay";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import { SplashAnimationOverlay } from "@/components/common/SplashAnimationOverlay";
import { perfMark } from "@/lib/perf";
import { bindQueryClientToNetwork } from "@/lib/queryNetworkBinding";
import { ToastProvider } from "@/lib/toast";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { CelebrationProvider } from "@/providers/CelebrationProvider";
import { LocalizationProvider } from "@/providers/LocalizationProvider";
import { NetworkProvider } from "@/providers/NetworkProvider";
import { SettingsProvider, useSettings } from "@/providers/SettingsProvider";
import { SystemSettingsProvider } from "@/providers/SystemSettingsProvider";
import { UserDocProvider, useUserDoc } from "@/providers/UserDocProvider";
import { WorkspaceProvider } from "@/providers/WorkspaceProvider";
import { AppThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette, THEME_STORAGE_KEY } from "@/theme/tokens";

export { ErrorBoundary } from "expo-router";

// Must run before any query mounts, so Query never assumes it is online.
bindQueryClientToNetwork();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // One retry, and only after a full second — a failing request on a weak
      // connection must not turn into a burst of near-instant repeats.
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      // Polls stay paused while the app is backgrounded (see focusManager).
      refetchIntervalInBackground: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

SplashScreen.preventAutoHideAsync().catch(() => {
  /* splash may already be hidden in fast refresh */
});

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { loading: authLoading } = useAuth();
  // Settings / userDoc continue loading in the background — not on the splash critical path.
  useSettings();
  useUserDoc();
  const [localStoresReady, setLocalStoresReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    perfMark("app_module");
  }, []);

  // Parallel: SecureStore + theme/first-launch AsyncStorage
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      SecureStore.getItemAsync("vault_biometric_id").catch(() => null),
      AsyncStorage.getItem(THEME_STORAGE_KEY).catch(() => null),
      AsyncStorage.getItem("@vault_has_launched_before").catch(() => null),
    ]).finally(() => {
      if (!cancelled) {
        setLocalStoresReady(true);
        perfMark("local_stores_ready");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const navigationRef = useNavigationContainerRef();
  useEffect(() => {
    if (navigationRef?.isReady()) {
      setNavigationReady(true);
      perfMark("navigation_ready");
      return;
    }
    const interval = setInterval(() => {
      if (navigationRef?.isReady()) {
        setNavigationReady(true);
        clearInterval(interval);
        perfMark("navigation_ready");
      }
    }, 50);
    return () => clearInterval(interval);
  }, [navigationRef]);

  useEffect(() => {
    if (fontsLoaded) perfMark("fonts_ready");
  }, [fontsLoaded]);

  // Critical path: auth + fonts + local stores + nav (not settings/userDoc)
  useEffect(() => {
    if (!authLoading && localStoresReady && navigationReady && fontsLoaded) {
      setAppIsReady(true);
      perfMark("app_ready");
    }
  }, [authLoading, localStoresReady, navigationReady, fontsLoaded]);

  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [appIsReady]);

  return (
    <>
      {children}
      {!animationComplete && appIsReady && (
        <SplashAnimationOverlay
          onAnimationComplete={() => {
            setAnimationComplete(true);
            perfMark("splash_animation_done");
          }}
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
          <NetworkProvider>
            <SystemSettingsProvider>
              <AuthProvider>
                <UserDocProvider>
                  <WorkspaceProvider>
                    <AppThemeProvider>
                      <SettingsProvider>
                        <LocalizationProvider>
                          <CelebrationProvider>
                            <ToastProvider>
                              <AppInitializer>
                                <RootNavigator />
                                <CelebrationOverlay />
                              </AppInitializer>
                            </ToastProvider>
                          </CelebrationProvider>
                        </LocalizationProvider>
                      </SettingsProvider>
                    </AppThemeProvider>
                  </WorkspaceProvider>
                </UserDocProvider>
              </AuthProvider>
            </SystemSettingsProvider>
          </NetworkProvider>
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
          animation: "fade_from_bottom",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(nutrition)" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="google-auth" options={{ animation: "none" }} />
        <Stack.Screen name="+not-found" options={{ animation: "fade" }} />
      </Stack>
      <OfflineBanner />
    </>
  );
}
