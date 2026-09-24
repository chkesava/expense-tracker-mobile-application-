import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname } from "expo-router";
import {
  ArrowLeftRight,
  CalendarSync,
  CreditCard,
  HandCoins,
  Landmark,
  MinusCircle,
  PlusCircle,
  Wallet,
} from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { haptic } from "@/lib/haptics";
import { useLedgerState } from "@/providers/LedgerStateProvider";
import { useModals } from "@/providers/ModalProvider";
import {
  orderAddActions,
  resolveAddActionContext,
  type AddActionId,
  type AddActionMeta,
} from "@/shared/config/addActions";
import { useTheme } from "@/theme/ThemeProvider";

const ICONS: Record<AddActionId, typeof PlusCircle> = {
  expense: MinusCircle,
  income: PlusCircle,
  transfer: ArrowLeftRight,
  receivable: HandCoins,
  borrowing: Wallet,
  recurring: CalendarSync,
  investment: Landmark,
  cardBill: CreditCard,
};

export function AddActionSheet() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const investmentsEnabled = useInvestmentsEnabled();
  const { ledgerTab } = useLedgerState();
  const {
    isAddSheetOpen,
    setIsAddSheetOpen,
    setAddTransactionKind,
    setIsAddExpenseOpen,
    setIsTransferOpen,
    setIsCreateInvestmentOpen,
    setIsDebtPaymentOpen,
    setIsCreateReceivableOpen,
    setIsCreateBorrowingOpen,
    setIsCreateRecurringOpen,
  } = useModals();

  // SPENDLY-141 — the sheet leads with what the screen underneath is about.
  // The hub keeps its active section in provider state rather than the URL, so
  // the route alone cannot answer this; `ledgerTab` only counts on /ledger.
  const context = resolveAddActionContext(pathname, ledgerTab);
  const { suggested, rest } = useMemo(
    () => orderAddActions(context, { investmentsEnabled }),
    [context, investmentsEnabled]
  );

  const closeSheet = () => setIsAddSheetOpen(false);

  const handleSelect = (id: AddActionId) => {
    void haptic.selection();
    closeSheet();
    switch (id) {
      case "expense":
        setAddTransactionKind("expense");
        setIsAddExpenseOpen(true);
        return;
      case "income":
        setAddTransactionKind("income");
        setIsAddExpenseOpen(true);
        return;
      case "transfer":
        setIsTransferOpen(true);
        return;
      case "receivable":
        setIsCreateReceivableOpen(true);
        return;
      case "borrowing":
        setIsCreateBorrowingOpen(true);
        return;
      case "recurring":
        setIsCreateRecurringOpen(true);
        return;
      case "investment":
        setIsCreateInvestmentOpen(true);
        return;
      case "cardBill":
        setIsDebtPaymentOpen(true);
        return;
    }
  };

  const renderAction = (action: AddActionMeta) => {
    const Icon = ICONS[action.id];
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
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.muted }]}>
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
  };

  const groupLabel = (text: string) => (
    <Text
      style={[
        styles.groupLabel,
        {
          color: theme.colors.mutedForeground,
          fontFamily: theme.fontFamily.semibold,
        },
      ]}
    >
      {text}
    </Text>
  );

  return (
    <Modal isOpen={isAddSheetOpen} onClose={closeSheet} title="Add" maxHeight="70%">
      <View style={styles.list}>
        {suggested.length > 0 ? (
          <>
            {groupLabel("For this screen")}
            {suggested.map(renderAction)}
            {groupLabel("Everything else")}
          </>
        ) : null}
        {rest.map(renderAction)}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 4,
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
