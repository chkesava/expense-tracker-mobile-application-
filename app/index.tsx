import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";

/** Entry redirect — auth → app shell, else → login. */
export default function Index() {
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
    return <Redirect href="/(app)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
