import { StyleSheet, Text, View } from "react-native";
import { PlusCircle } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { useModals } from "@/providers/ModalProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function AddTransactionModal() {
  const { isAddExpenseOpen, setIsAddExpenseOpen } = useModals();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <Modal
      isOpen={isAddExpenseOpen}
      onClose={() => setIsAddExpenseOpen(false)}
      title="Add Transaction"
    >
      <View style={styles.container}>
        <View
          style={[
            styles.placeholderCard,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.08)"
                : "rgba(79, 70, 255, 0.05)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary }]}>
            <PlusCircle size={28} color={theme.colors.primaryForeground} />
          </View>
          <Text
            style={[
              styles.placeholderTitle,
              { color: theme.colors.foreground, fontSize: theme.typography.lg },
            ]}
          >
            New Transaction
          </Text>
          <Text
            style={[
              styles.placeholderSubtitle,
              { color: theme.colors.mutedForeground, fontSize: theme.typography.sm },
            ]}
          >
            Expense, Income, Account Transfers & Split bill forms arrive in Phase 8.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            onPress={() => setIsAddExpenseOpen(false)}
            variant="primary"
            size="lg"
          >
            Done
          </Button>
        </View>
      </View>
    </Modal>
  );
}

export default AddTransactionModal;

const styles = StyleSheet.create({
  container: {
    gap: 20,
    alignItems: "center",
  },
  placeholderCard: {
    width: "100%",
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  placeholderTitle: {
    fontWeight: "800",
  },
  placeholderSubtitle: {
    textAlign: "center",
    lineHeight: 20,
  },
  actions: {
    width: "100%",
  },
});
