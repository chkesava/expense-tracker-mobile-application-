import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { getFirebaseClients } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Phase 1 foundation surface — verifies providers, tokens, Firebase bootstrap,
 * and UI primitives. Not Auth / Dashboard / Transactions.
 */
export default function FoundationScreen() {
  const { theme, themeName, toggleTheme } = useTheme();
  const firebase = getFirebaseClients();

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { padding: theme.space.lg, gap: theme.space.lg },
        ]}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: theme.typography.xxl,
            fontWeight: "900",
          }}
        >
          Phase 1 Foundation
        </Text>
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            lineHeight: 20,
          }}
        >
          Expo Router root layout, theme tokens, Firebase clients, and shared UI
          primitives. Auth and product screens arrive in later phases.
        </Text>

        <Card
          title="Runtime"
          subtitle="Theme + Firebase bootstrap diagnostics"
        >
          <View style={{ gap: theme.space.sm }}>
            <Text style={{ color: theme.colors.cardForeground }}>
              Theme: {themeName}
            </Text>
            <Text style={{ color: theme.colors.cardForeground }}>
              Firebase configured: {firebase.configured ? "yes" : "no"}
            </Text>
            <Text style={{ color: theme.colors.cardForeground }}>
              Firestore cache: {firebase.firestoreCacheMode}
            </Text>
            {firebase.error ? (
              <Text style={{ color: theme.colors.destructive }}>
                {firebase.error}
              </Text>
            ) : null}
            <Button onPress={toggleTheme} variant="secondary">
              Toggle light / dark
            </Button>
          </View>
        </Card>

        <Card title="Primitives" subtitle="Button · Input · Amount · Toast">
          <View style={{ gap: theme.space.md }}>
            <Amount value={12450.5} />
            <Input label="Sample field" placeholder="Type here" />
            <View style={{ flexDirection: "row", gap: theme.space.sm }}>
              <Button
                style={{ flex: 1 }}
                onPress={() => toast.success("Foundation toast OK")}
              >
                Toast
              </Button>
              <Button style={{ flex: 1 }} variant="outline">
                Outline
              </Button>
            </View>
            <Skeleton height={14} />
            <Skeleton height={14} width="60%" />
          </View>
        </Card>

        <Card>
          <EmptyState
            title="No transactions yet"
            description="Placeholder empty state for later ledger screens."
            action={
              <Button variant="ghost" onPress={() => toast.info("Phase 8 will own this")}>
                Add later
              </Button>
            }
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingBottom: 40 },
});
