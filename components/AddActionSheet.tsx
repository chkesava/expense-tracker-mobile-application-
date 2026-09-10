import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ArrowLeftRight,
  CreditCard,
  Landmark,
  MinusCircle,
  PlusCircle,
} from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { haptic } from "@/lib/haptics";
import { useModals } from "@/providers/ModalProvider";
import { useTheme } from "@/theme/ThemeProvider";

type AddActionId = "expense" | "income" | "transfer" | "investment" | "debt";

const ACTIONS: Array<{
  id: AddActionId;
  label: string;
  hint: string;
  Icon: typeof PlusCircle;
  requiresInvestments?: boolean;
}> = [
  {
    id: "expense",
    label: "Expense",
    hint: "Log a spend against a category",
    Icon: MinusCircle,
  },
  {
    id: "income",
    label: "Income",
    hint: "Record salary, refund, or other inflow",
    Icon: PlusCircle,
  },
  {
    id: "transfer",
    label: "Transfer",
    hint: "Move money between accounts",
    Icon: ArrowLeftRight,
  },
  {
    id: "investment",
    label: "Investment",
    hint: "Add an FD, fund, or other holding",
    Icon: Landmark,
    requiresInvestments: true,
  },
  {
    id: "debt",
    label: "Debt Payment",
    hint: "Pay a credit-card statement",
    Icon: CreditCard,
  },
];

export function AddActionSheet() {
  const { theme } = useTheme();
  const investmentsEnabled = useInvestmentsEnabled();
  const {
    isAddSheetOpen,
    setIsAddSheetOpen,
    setAddTransactionKind,
    setIsAddExpenseOpen,
    setIsTransferOpen,
    setIsCreateInvestmentOpen,
    setIsDebtPaymentOpen,
  } = useModals();

  const closeSheet = () => setIsAddSheetOpen(false);

  const handleSelect = (id: AddActionId) => {
    void haptic.selection();
    closeSheet();
    if (id === "expense") {
      setAddTransactionKind("expense");
      setIsAddExpenseOpen(true);
      return;
    }
    if (id === "income") {
      setAddTransactionKind("income");
      setIsAddExpenseOpen(true);
      return;
    }
    if (id === "transfer") {
      setIsTransferOpen(true);
      return;
    }
    if (id === "investment") {
      setIsCreateInvestmentOpen(true);
      return;
    }
    setIsDebtPaymentOpen(true);
  };

  return (
    <Modal isOpen={isAddSheetOpen} onClose={closeSheet} title="Add" maxHeight="70%">
      <View style={styles.list}>
        {ACTIONS.filter(
          (action) => !action.requiresInvestments || investmentsEnabled
        ).map((action) => {
          const Icon = action.Icon;
          return (
            <Pressable
              key={action.id}
              onPress={() => handleSelect(action.id)}
              android_ripple={{ color: theme.colors.primary + "18" }}
              style={({ pressed }) => [
                styles.row,
                { borderColor: theme.colors.border },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: theme.colors.muted },
                ]}
              >
                <Icon size={18} color={theme.colors.foreground} strokeWidth={2.2} />
              </View>
              <View style={styles.copy}>
                <Text
                  style={{
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.semibold,
                    fontSize: 15,
                  }}
                >
                  {action.label}
                </Text>
                <Text
                  style={{
                    color: theme.colors.mutedForeground,
                    fontFamily: theme.fontFamily.regular,
                    fontSize: 12,
                  }}
                >
                  {action.hint}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: "continuous",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
