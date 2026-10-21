import { memo, useMemo, type ComponentType } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  CreditCard,
  LayoutGrid,
  Plus,
  Repeat,
  SquarePen,
  Users,
} from "lucide-react-native";

import { Chip } from "@/components/ui/Chip";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { Section, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useModalActions } from "@/providers/ModalProvider";
import { useTheme } from "@/theme/ThemeProvider";

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

type Action = {
  id: string;
  label: string;
  icon: IconType;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
};

/**
 * Data-viz violet for the Budget orb: no theme token carries a fourth hue, and
 * like `categoryRamp`'s tail it has no positive/negative meaning.
 */
const BUDGET_ORB = "#B07CFF";

/**
 * Quick actions (SPENDLY-532; round orbs since SPENDLY-566). Each orb opens
 * the same form the add sheet does — no new write path. Budget opens the
 * money settings, where the monthly and category budgets are set.
 */
export const QuickAddWidget = memo(function QuickAddWidget() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { setAddTransactionKind, setIsAddExpenseOpen, setIsTransferOpen } = useModalActions();

  const actions = useMemo<Action[]>(
    () => [
      {
        id: "expense",
        label: "Expense",
        icon: Plus,
        color: theme.colors.destructive,
        accessibilityLabel: "Add expense",
        onPress: () => {
          setAddTransactionKind("expense");
          setIsAddExpenseOpen(true);
        },
      },
      {
        id: "income",
        label: "Income",
        icon: ArrowDownToLine,
        color: theme.colors.success,
        accessibilityLabel: "Add income",
        onPress: () => {
          setAddTransactionKind("income");
          setIsAddExpenseOpen(true);
        },
      },
      {
        id: "transfer",
        label: "Transfer",
        icon: ArrowLeftRight,
        color: theme.colors.info,
        accessibilityLabel: "Add transfer",
        onPress: () => setIsTransferOpen(true),
      },
      {
        id: "budget",
        label: "Budget",
        icon: SquarePen,
        color: BUDGET_ORB,
        accessibilityLabel: "Set budgets",
        onPress: () => router.push("/settings/money" as Href),
      },
    ],
    [theme.colors, router, setAddTransactionKind, setIsAddExpenseOpen, setIsTransferOpen]
  );

  return (
    <View style={styles.grid}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Pressable
            key={action.id}
            onPress={() => {
              void (action.id === "expense" ? haptic.impact() : haptic.selection());
              action.onPress();
            }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
          >
            <View
              style={[
                styles.orb,
                {
                  backgroundColor: withAlpha(action.color, surfaces.isDark ? 0.18 : 0.12),
                  borderColor: withAlpha(action.color, surfaces.isDark ? 0.55 : 0.4),
                },
              ]}
            >
              <Icon size={24} color={action.color} strokeWidth={2.3} />
            </View>
            <Text
              style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
              numberOfLines={1}
            >
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

export interface QuickShortcutsWidgetProps {
  /** Opens the full add sheet (every add action, ordered for this screen). */
  onOpenAddSheet: () => void;
}

/**
 * The quick-action shortcut rail (SPENDLY-532). SPENDLY-566 moves it under the
 * dashboard's main sections and adds Pay card, which gave its orb to Budget.
 */
export const QuickShortcutsWidget = memo(function QuickShortcutsWidget({
  onOpenAddSheet,
}: QuickShortcutsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { setIsDebtPaymentOpen } = useModalActions();

  const shortcuts = useMemo(
    () => [
      { id: "more", label: "All actions", icon: LayoutGrid, onPress: onOpenAddSheet },
      { id: "cardBill", label: "Pay card", icon: CreditCard, onPress: () => setIsDebtPaymentOpen(true) },
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
    [router, onOpenAddSheet, setIsDebtPaymentOpen]
  );

  return (
    <Section title="Shortcuts" contentStyle={styles.shortcutsBody}>
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
    </Section>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  action: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  orb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
  },
  shortcutsBody: {
    marginTop: 2,
  },
  rail: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
});
