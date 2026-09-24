import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { ExpenseForm } from "@/components/ExpenseForm";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/theme/ThemeProvider";

export default function AddScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <PageShell scrollable={false}>
      {/* Header */}
      <View style={styles.header}>
        <Button
          variant="tonal"
          size="icon"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={theme.colors.onSecondaryContainer} />
        </Button>
        <Text
          style={[
            styles.headerTitle,
            { color: theme.colors.foreground, fontSize: theme.typography.lg },
          ]}
        >
          New Transaction
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.formWrap}>
        <ExpenseForm
          onSuccess={() => router.back()}
          onCancel={() => router.back()}
        />
      </View>
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
  headerSpacer: {
    width: 48,
  },
  headerTitle: {
    fontWeight: "800",
  },
  formWrap: {
    flex: 1,
  },
});
