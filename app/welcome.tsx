import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Flower2, Wallet } from "lucide-react-native";

import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { resolveWorkspaceRoute } from "@/shared/config/workspaceRoutes";
import { useTheme } from "@/theme/ThemeProvider";

export default function WelcomeScreen() {
  const { theme } = useTheme();
  const { user, loading } = useAuth();
  const { setActiveWorkspace, activeWorkspace } = useWorkspace();

  if (loading) {
    return <View style={[styles.fill, { backgroundColor: theme.colors.background }]} />;
  }

  if (user) {
    return <Redirect href={resolveWorkspaceRoute(activeWorkspace) as never} />;
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <View style={styles.body}>
        <Text style={[styles.kicker, { color: theme.colors.mutedForeground }]}>Welcome</Text>
        <Text style={[styles.title, { color: theme.colors.foreground }]}>Choose your app</Text>
        <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
          Same Firebase sign-in. Expense Tracker and Ganesh Seva stay separate.
        </Text>

        <Pressable
          onPress={() => {
            void setActiveWorkspace("expense");
          }}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: theme.colors.primary }]}>
            <Wallet size={22} color={theme.colors.primaryForeground} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>Expense Tracker</Text>
            <Text style={[styles.cardDesc, { color: theme.colors.mutedForeground }]}>
              Personal ledger, accounts, splits, and vaults.
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            void setActiveWorkspace("ganesh");
          }}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: "rgba(249, 115, 22, 0.15)" }]}>
            <Flower2 size={22} color="#F97316" />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>Ganesh Seva</Text>
            <Text style={[styles.cardDesc, { color: theme.colors.mutedForeground }]}>
              Shared Pandal hisab for our committee.
            </Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 14,
  },
  kicker: {
    fontWeight: "700",
    textAlign: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 16,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 4 },
  cardTitle: { fontWeight: "800" },
  cardDesc: { lineHeight: 20 },
});
