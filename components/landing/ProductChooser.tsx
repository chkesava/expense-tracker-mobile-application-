import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Apple, Flower2, Wallet } from "lucide-react-native";

import { SpendlyLogo } from "@/components/auth/SpendlyLogo";
import { WEB_BASE_PATHS } from "@/lib/activeProduct";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Bare-root screen for the web-only "landing" build (spendly-share.netlify.app/).
 * Each card is a full-page navigation, not an in-app <Link> — /expense,
 * /nutrition and /ganesh are each their own separately-built SPA under this
 * same Netlify site, not routes inside this bundle.
 */
function goToProduct(basePath: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.assign(`${basePath}/`);
  }
}

export function ProductChooser() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <View style={styles.body}>
        <View style={styles.header}>
          <SpendlyLogo size={72} />
          <Text style={[styles.title, { color: theme.colors.foreground }]}>Spendly</Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            One sign-in. Three apps.
          </Text>
        </View>

        <Pressable
          onPress={() => goToProduct(WEB_BASE_PATHS.expense)}
          style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
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
          onPress={() => goToProduct(WEB_BASE_PATHS.nutrition)}
          style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          <View style={[styles.icon, { backgroundColor: "rgba(22, 101, 52, 0.15)" }]}>
            <Apple size={22} color="#16A34A" />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>Nutrition</Text>
            <Text style={[styles.cardDesc, { color: theme.colors.mutedForeground }]}>
              Meal logging, photo analysis, and insights.
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => goToProduct(WEB_BASE_PATHS.ganesh)}
          style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          <View style={[styles.icon, { backgroundColor: "rgba(249, 115, 22, 0.15)" }]}>
            <Flower2 size={22} color="#F97316" />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>Ganesh Pandal</Text>
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
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginTop: 12,
  },
  subtitle: {
    textAlign: "center",
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
