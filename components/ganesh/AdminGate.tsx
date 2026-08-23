import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const { replace } = useRouter();
  const { isAdmin, loading } = useGaneshPermissions();

  useEffect(() => {
    if (loading || isAdmin) return;
    const timer = setTimeout(() => replace("/(ganesh)" as never), 1600);
    return () => clearTimeout(timer);
  }, [isAdmin, loading, replace]);

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

  if (!isAdmin) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Access denied
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
          Only a Pandal Admin can open the Admin Dashboard.
        </Text>
        <Button onPress={() => replace("/(ganesh)" as never)}>Back to Ganesh Seva</Button>
      </GaneshScreen>
    );
  }

  return <>{children}</>;
}
