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

import { ACTIVE_PRODUCT, IS_LANDING_BUILD } from "@/lib/activeProduct";
import { AppErrorBoundary } from "@/components/common/AppErrorBoundary";
import { CelebrationOverlay } from "@/components/common/CelebrationOverlay";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import { ProductSplashOverlay } from "product-splash-overlay";
import { UpdateAvailableSheet } from "@/components/UpdateAvailableSheet";
import { webWidthConstraintStyle } from "@/components/common/WebWidthConstraint";
import { isPermissionError, logWarning } from "@/lib/errors";
import { installGlobalErrorHandlers } from "@/lib/globalErrorHandler";
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

// Uncaught throws / unhandled rejections — installed before any provider mounts.
installGlobalErrorHandlers();

/** Longest the splash screen may block the UI before we show it regardless. */
const SPLASH_TIMEOUT_MS = 10_000;

/**
 * Route-level boundary used by expo-router.
 *
 * Replaces expo-router's built-in export, which renders the raw error message
 * and stack trace to the user in release builds.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <AppErrorBoundary scope="router.route" onReset={() => void retry()}>
      <ThrowOnce error={error} />
    </AppErrorBoundary>
  );
}

/** Re-throws into the boundary above so both paths share one fallback UI. */
function ThrowOnce({ error }: { error: Error }): never {
  throw error;
}

// Must run before any query mounts, so Query never assumes it is online.
bindQueryClientToNetwork();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Retrying a permission/auth failure just burns battery and rate limit —
      // it will fail identically until the user re-authenticates. Backoff keeps
      // a failure on a weak connection from becoming a burst of instant repeats.
      retry: (failureCount, error) => !isPermissionError(error) && failureCount < 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      // Polls stay paused while the app is backgrounded (see focusManager).
      refetchIntervalInBackground: false,
    },
    mutations: {
      // Never auto-retry a financial write: a retry of a mutation whose
      // response was merely lost is how duplicates get created.
      retry: false,
    },
  },
});

SplashScreen.preventAutoHideAsync().catch(() => {
  /* splash may already be hidden in fast refresh */
});

if (ACTIVE_PRODUCT === "ganesh") {
  SplashScreen.setOptions({ fade: true, duration: 280 });
}

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
  const [overlayPainted, setOverlayPainted] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [readyTimedOut, setReadyTimedOut] = useState(false);
  // A font that fails to load leaves `fontsLoaded` false forever. Treat a
  // failure as "done" and fall back to the system font rather than holding
  // the splash screen up indefinitely.
  const fontsSettled = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    perfMark("app_module");
  }, []);

  // Parallel: SecureStore + theme/first-launch AsyncStorage
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      // expo-secure-store has no web implementation, so getItemAsync always
      // rejects there. The .catch keeps the gate working either way; skipping
      // the call keeps the public web pages quiet.
      Platform.OS === "web"
        ? Promise.resolve(null)
        : SecureStore.getItemAsync("vault_biometric_id").catch(() => null),
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
    if (fontError) logWarning("app.fontsLoad", fontError);
    if (fontsSettled) perfMark("fonts_ready");
  }, [fontsSettled, fontError]);

  // Hard ceiling on the splash screen. If any single readiness signal never
  // arrives (font server down, auth listener never fires, navigation container
  // never mounts) the user would otherwise sit on the splash forever.
  useEffect(() => {
    const timer = setTimeout(() => setReadyTimedOut(true), SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Critical path: auth + fonts + local stores + nav (not settings/userDoc)
  useEffect(() => {
    const criticalPathReady =
      !authLoading && localStoresReady && navigationReady && fontsSettled;
    if (criticalPathReady || readyTimedOut) {
      if (readyTimedOut && !criticalPathReady) {
        logWarning("app.startupTimeout", new Error("Startup gates did not settle"), {
          authLoading,
          localStoresReady,
          navigationReady,
          fontsSettled,
        });
      }
      setAppIsReady(true);
      perfMark("app_ready");
    }
  }, [authLoading, localStoresReady, navigationReady, fontsSettled, readyTimedOut]);

  useEffect(() => {
    if (ACTIVE_PRODUCT === "ganesh") {
      if (overlayPainted || appIsReady) {
        SplashScreen.hideAsync().catch(() => undefined);
      }
      return;
    }
    if (appIsReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [appIsReady, overlayPainted]);

  const showGaneshSplash = ACTIVE_PRODUCT === "ganesh" && !animationComplete;
  const showDefaultSplash = ACTIVE_PRODUCT !== "ganesh" && !animationComplete && appIsReady;

  return (
    <>
      {children}
      {(showGaneshSplash || showDefaultSplash) ? (
        <ProductSplashOverlay
          isReady={appIsReady}
          onFirstFrame={() => setOverlayPainted(true)}
          onAnimationComplete={() => {
            setAnimationComplete(true);
            perfMark("splash_animation_done");
          }}
        />
      ) : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Outermost net: a throw inside any provider still paints a usable screen. */}
      <AppErrorBoundary scope="app.root">
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
                                {/* Inner net: a screen crash keeps providers,
                                    session and cached data alive. */}
                                <AppErrorBoundary scope="app.navigator">
                                  <RootNavigator />
                                </AppErrorBoundary>
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
      </AppErrorBoundary>
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
          contentStyle: { backgroundColor: theme.colors.background, ...webWidthConstraintStyle },
          animation: "fade_from_bottom",
        }}
      >
        <Stack.Screen name="index" />
        {/*
          The web-only "landing" build (bare root chooser) blocks these three
          route files from Metro entirely (see metro.config.js's
          LANDING_EXTRA_BLOCKS), so they must not be registered here either —
          same three-separate-expressions requirement as the product screens
          below (useFilterScreenChildren does not flatten a Fragment).
        */}
        {!IS_LANDING_BUILD && <Stack.Screen name="welcome" options={{ animation: "fade" }} />}
        {!IS_LANDING_BUILD && <Stack.Screen name="onboarding" options={{ animation: "fade" }} />}
        {!IS_LANDING_BUILD && <Stack.Screen name="(auth)" options={{ animation: "fade" }} />}
        {/*
          A single-product build only ever has one of these route groups on
          disk (metro.config.js blocks the other two), so only register the
          screen(s) that exist. ACTIVE_PRODUCT === null (unset) is the
          existing combined build — register all of them, unchanged. The
          web-only "landing" build also resolves ACTIVE_PRODUCT to null (it
          isn't a member of the Product union) but blocks ALL product routes
          from Metro, so it must be excluded here too, or these would
          register screens for route files that don't exist in that bundle.
        */}
        {!IS_LANDING_BUILD && (ACTIVE_PRODUCT === null || ACTIVE_PRODUCT === "expense") && (
          <Stack.Screen name="(app)" />
        )}
        {!IS_LANDING_BUILD && (ACTIVE_PRODUCT === null || ACTIVE_PRODUCT === "nutrition") && (
          <Stack.Screen name="(nutrition)" options={{ animation: "slide_from_right" }} />
        )}
        {/*
          Deliberately three separate expressions, not one Fragment wrapping
          three screens: expo-router's useFilterScreenChildren only
          recognizes direct <Stack.Screen> elements passed to <Stack> — it
          does not flatten a <>...</> Fragment's children, so all three
          would otherwise be silently dropped (just a console.warn), never
          registered as navigable screens. That produced a genuinely broken
          Ganesh-only build: the first redirect into /(ganesh) failed to
          resolve, and AppErrorBoundary caught it immediately on launch.
        */}
        {/*
          Ganesh opts out of the shared 480 web cap. A child maxWidth of 720/1100
          cannot exceed a 480 parent, so these three screens replace contentStyle
          instead of spreading webWidthConstraintStyle. GaneshScreen applies its
          own cap. Keep three separate <Stack.Screen> expressions — a Fragment
          is not flattened by useFilterScreenChildren.
        */}
        {!IS_LANDING_BUILD && (ACTIVE_PRODUCT === null || ACTIVE_PRODUCT === "ganesh") && (
          <Stack.Screen
            name="(ganesh)"
            options={{
              animation: "slide_from_right",
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        )}
        {!IS_LANDING_BUILD && (ACTIVE_PRODUCT === null || ACTIVE_PRODUCT === "ganesh") && (
          <Stack.Screen
            name="(ganesh-auth)"
            options={{
              animation: "fade",
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        )}
        {!IS_LANDING_BUILD && (ACTIVE_PRODUCT === null || ACTIVE_PRODUCT === "ganesh") && (
          <Stack.Screen
            name="ganesh-phone-auth"
            options={{
              animation: "none",
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        )}
        <Stack.Screen name="google-auth" options={{ animation: "none" }} />
        <Stack.Screen name="payment/[slug]" options={{ animation: "fade" }} />
        <Stack.Screen name="split/[slug]" options={{ animation: "fade" }} />
        <Stack.Screen name="+not-found" options={{ animation: "fade" }} />
      </Stack>
      <OfflineBanner />
      {/*
        Cross-cutting, product-agnostic: was only ever mounted in
        app/(app)/_layout.tsx (Expense's own shell), so Nutrition and Ganesh
        never showed an update prompt at all — not a regression from the
        split, just a gap that only started mattering once they became
        separately installed apps. useAppUpdate() already resolves the
        right product-scoped Firestore doc via ACTIVE_PRODUCT and gates on
        Platform.OS === "android" internally, so one root-level mount
        covers all three products (and the combined build) correctly.
      */}
      <UpdateAvailableSheet />
    </>
  );
}
