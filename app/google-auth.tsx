import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { activeProductRootRoute } from "@/lib/activeProduct";

/**
 * Deep-link target for Google web-bridge AuthSession
 * (`Linking.createURL("google-auth")` → `/google-auth`).
 * Token handling happens in `signInWithGoogleViaWebBridge`; this screen only
 * avoids Expo Router's "Screen not found" after the browser redirects back.
 */
export default function GoogleAuthCallbackScreen() {
  const { theme } = useTheme();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href={activeProductRootRoute() as never} />;
  }

  return <Redirect href="/(auth)/login" />;
}
