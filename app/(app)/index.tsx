import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Phase 2 signed-in landing — not Dashboard (Phase 10).
 * Proves auth + system settings + logout.
 */
export default function AppHomeScreen() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const { settings } = useSystemSettings();

  const onLogout = async () => {
    try {
      await logout();
      toast.success("Signed out");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Logout failed");
    }
  };

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: theme.space.lg,
          gap: theme.space.lg,
        }}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: theme.typography.xxl,
            fontWeight: "900",
          }}
        >
          You are signed in
        </Text>
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            lineHeight: 20,
          }}
        >
          Phase 2 authentication is active. Dashboard and ledger arrive in later
          phases.
        </Text>

        {settings.announcementBanner ? (
          <Card title="Announcement">
            <Text style={{ color: theme.colors.cardForeground }}>
              {settings.announcementBanner}
            </Text>
          </Card>
        ) : null}

        <Card title="Session" subtitle="Firebase Auth user">
          <View style={{ gap: theme.space.sm }}>
            <Text style={{ color: theme.colors.cardForeground }}>
              Name: {user?.displayName || "—"}
            </Text>
            <Text style={{ color: theme.colors.cardForeground }}>
              Email: {user?.email || "—"}
            </Text>
            <Text style={{ color: theme.colors.cardForeground }}>
              UID: {user?.uid}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              Currency default: {settings.defaultCurrency} · Signups{" "}
              {settings.disableSignups ? "disabled" : "enabled"}
            </Text>
            <Button variant="destructive" onPress={onLogout}>
              Sign out
            </Button>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
