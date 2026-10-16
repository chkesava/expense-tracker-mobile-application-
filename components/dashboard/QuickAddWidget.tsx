import { memo, useMemo, type ComponentType } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  ArrowLeftRight,
  CreditCard,
  LayoutGrid,
  MinusCircle,
  PlusCircle,
  Repeat,
  Users,
} from "lucide-react-native";

import { Chip } from "@/components/ui/Chip";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { DASH_RADIUS, useSurfaces } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useModalActions } from "@/providers/ModalProvider";
import { useTheme } from "@/theme/ThemeProvider";

export interface QuickAddWidgetProps {
  /** Opens the full add sheet (every add action, ordered for this screen). */
  onAddExpense: () => void;
}

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

type Action = {
  id: string;
  label: string;
  icon: IconType;
  primary?: boolean;
  onPress: () => void;
};

/**
 * Quick actions (SPENDLY-532). Each tile opens the same form the add sheet
 * does — no new write path — and the shortcut rail keeps the two dashboard
 * links that are not already bottom-nav tabs.
 */
export const QuickAddWidget = memo(function QuickAddWidget({ onAddExpense }: QuickAddWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const {
    setAddTransactionKind,
    setIsAddExpenseOpen,
    setIsTransferOpen,
    setIsDebtPaymentOpen,
  } = useModalActions();

  const actions = useMemo<Action[]>(
    () => [
      {
        id: "expense",
        label: "Expense",
        icon: MinusCircle,
        primary: true,
        onPress: () => {
          setAddTransactionKind("expense");
          setIsAddExpenseOpen(true);
        },
      },
      {
        id: "income",
        label: "Income",
        icon: PlusCircle,
        onPress: () => {
          setAddTransactionKind("income");
          setIsAddExpenseOpen(true);
        },
      },
      {
        id: "transfer",
        label: "Transfer",
        icon: ArrowLeftRight,
        onPress: () => setIsTransferOpen(true),
      },
      {
        id: "cardBill",
        label: "Pay card",
        icon: CreditCard,
        onPress: () => setIsDebtPaymentOpen(true),
      },
    ],
    [setAddTransactionKind, setIsAddExpenseOpen, setIsTransferOpen, setIsDebtPaymentOpen]
  );

  const shortcuts = useMemo(
    () => [
      { id: "more", label: "All actions", icon: LayoutGrid, onPress: onAddExpense },
      {
        id: "splits",
        label: "Split bills",
        icon: Users,
        onPress: () => router.push("/vaults?tab=splits" as Href),
      },
      {
        id: "subscriptions",
        label: "Recurring",
        icon: Repeat,
        onPress: () => router.push("/ledger?tab=subscriptions" as Href),
      },
    ],
    [router, onAddExpense]
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {actions.map((action) => {
          const Icon = action.icon;
          const fg = action.primary ? theme.colors.primaryForeground : theme.colors.primary;
          return (
            <Pressable
              key={action.id}
              onPress={() => {
                void (action.primary ? haptic.impact() : haptic.selection());
                action.onPress();
              }}
              android_ripple={{ color: surfaces.control, borderless: false }}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
                pressed && styles.tilePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.id === "cardBill" ? "Pay a credit card bill" : `Add ${action.label.toLowerCase()}`}
            >
              <View
                style={[
                  styles.tileGlyph,
                  {
                    backgroundColor: action.primary
                      ? theme.colors.primary
                      : surfaces.wash(theme.colors.primary),
                  },
                ]}
              >
                <Icon size={19} color={fg} strokeWidth={2.3} />
              </View>
              <Text
                style={[styles.tileLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {shortcuts.map((chip) => {
            const Icon = chip.icon;
            return (
              <Chip
                key={chip.id}
                size="sm"
                label={chip.label}
                onPress={chip.onPress}
                icon={() => (
                  <Icon size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                )}
              />
            );
          })}
        </ScrollView>
      </HorizontalSwipeBoundary>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  grid: {
    flexDirection: "row",
    gap: 8,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: DASH_RADIUS.tile + 2,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  tilePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  tileGlyph: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 12,
  },
  rail: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
});
