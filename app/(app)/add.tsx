import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ExpenseForm } from "@/components/ExpenseForm";
import { PageShell } from "@/components/layout/PageShell";
import { useTheme } from "@/theme/ThemeProvider";

export default function AddScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <PageShell>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: theme.colors.muted }]}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={theme.colors.foreground} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            { color: theme.colors.foreground, fontSize: theme.typography.lg },
          ]}
        >
          New Transaction
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ExpenseForm onSuccess={() => router.back()} onCancel={() => router.back()} />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontWeight: "800",
  },
});
