import { StyleSheet } from "react-native";
import { Users } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { useTheme } from "@/theme/ThemeProvider";

export default function VaultsScreen() {
  const { theme } = useTheme();

  return (
    <PageShell contentContainerStyle={styles.container}>
      <PageHeader
        title="Shared Vaults"
        subtitle="Collaborative Group Budgets"
        icon={<Users size={22} color={theme.colors.primary} />}
      />

      <EmptyState
        icon={<Users size={36} color={theme.colors.mutedForeground} />}
        title="Shared Vaults"
        description="Collaborative group expense spaces, family budgeting, and member permissions connect in Phase 19."
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
});
