import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";

/** Entry redirect — auth → app shell, else → login. */
export default function Index() {
  const { theme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace();

  if (authLoading || workspaceLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0F2F4B",
        }}
      />
    );
  }

  if (user) {
    if (activeWorkspace === "nutrition") {
      return <Redirect href={"/(nutrition)" as any} />;
    }
    return <Redirect href={"/(app)" as any} />;
  }

  return <Redirect href="/(auth)/login" />;
}
