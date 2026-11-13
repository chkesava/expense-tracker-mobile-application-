import { memo, useMemo, useState, type ComponentType } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  LayoutGrid,
  Plus,
  Repeat,
  SquarePen,
  Users,
  Zap,
} from "lucide-react-native";

import { Chip } from "@/components/ui/Chip";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { mixColors, Section, SectionAction, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
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

/** The `orbs` variant's natural (non-panel) orb size, from its stylesheet. */
const ORB_SIZE = 64;
/**
 * Below this a fixed 64×64 orb overflows its own flex cell on every phone
 * width in the Spendly viewport matrix (320–412px) — six actions in one
 * unwrapped row never had six cells that wide. The orb now shrinks to fit
 * instead (SPENDLY dashboard redesign fix), down to a still-tappable floor.
 */
const ORB_MIN_SIZE = 44;
const ORB_CELL_PADDING = 8;
/** Narrowest cell (px) that still fits a label like "Transfer" on one line. */
const MIN_CELL_FOR_ONE_ROW = 72;

/**
 * Quick actions (SPENDLY-532; round orbs since SPENDLY-566). Each orb opens
 * the same form the add sheet does — no new write path. Budget opens the
 * money settings, where the monthly and category budgets are set.
 *
 * SPENDLY-718: the `panel` variant is the desktop dashboard's titled card,
 * with smaller orbs and a "View all" that opens the full add sheet.
 */
export const QuickAddWidget = memo(function QuickAddWidget({
  variant = "orbs",
  onViewAll,
  style,
}: {
  variant?: "orbs" | "panel";
  /** Opens the full add sheet; the panel's "View all". */
  onViewAll?: () => void;
  style?: StyleProp<ViewStyle>;
} = {}) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const panel = variant === "panel";
  const { setAddTransactionKind, setIsAddExpenseOpen, setIsTransferOpen, setIsDebtPaymentOpen } = useModalActions();
  const [rowWidth, setRowWidth] = useState(0);
  const handleRowLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);

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
      {
        id: "bill",
        label: "Bill",
        icon: CreditCard,
        color: theme.colors.warning,
        accessibilityLabel: "Pay a credit card bill",
        onPress: () => setIsDebtPaymentOpen(true),
      },
      {
        id: "report",
        label: "Report",
        icon: BarChart3,
        color: theme.colors.info,
        accessibilityLabel: "Open reports",
        onPress: () => router.push("/insights" as Href),
      },
    ],
    [theme.colors, router, setAddTransactionKind, setIsAddExpenseOpen, setIsTransferOpen, setIsDebtPaymentOpen]
  );

  // The non-panel row never wraps or scrolls — all six orbs always show at
  // once — so a fixed 64×64 orb overflows its own cell on every phone width
  // in the matrix (320–412px: ~48–63px per cell). Shrink it to the measured
  // cell instead, down to a still-tappable floor.
  // Below MIN_CELL_FOR_ONE_ROW a cell can't hold its label ("Expe…",
  // "Tran…" on a 320-412px phone), so the six actions take two rows of three.
  const twoRows = !panel && rowWidth > 0 && rowWidth / actions.length < MIN_CELL_FOR_ONE_ROW;
  const columns = twoRows ? Math.ceil(actions.length / 2) : actions.length;
  const orbSize = panel
    ? undefined
    : rowWidth > 0
      ? Math.max(ORB_MIN_SIZE, Math.min(ORB_SIZE, rowWidth / columns - ORB_CELL_PADDING))
      : ORB_SIZE;

  const orbs = (
    <View style={[styles.grid, panel && styles.gridPanel, twoRows && styles.gridTwoRows]} onLayout={panel ? undefined : handleRowLayout}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Pressable
            key={action.id}
            onPress={() => {
              void (action.id === "expense" ? haptic.impact() : haptic.selection());
              action.onPress();
            }}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.action,
              twoRows && { flexGrow: 0, flexBasis: `${100 / columns}%` },
              panel && styles.actionPanel,
              panel && hovered && { backgroundColor: surfaces.control },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
          >
            <View
              style={[
                styles.orb,
                panel && styles.orbPanel,
                !panel && orbSize ? { width: orbSize, height: orbSize, borderRadius: orbSize / 2 } : null,
                {
                  // SPENDLY-572: a deep, opaque tint of the hue with a bright
                  // ring, as in the reference — not a pale wash.
                  backgroundColor: mixColors(theme.colors.background, action.color, 0.2),
                  borderColor: withAlpha(action.color, 0.8),
                  boxShadow: `0 6px 18px ${withAlpha(action.color, 0.18)}`,
                },
              ]}
            >
              <Icon
                size={panel ? 22 : Math.round((orbSize ?? ORB_SIZE) * 0.42)}
                color={action.color}
                strokeWidth={2.4}
              />
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

  if (!panel) return orbs;

  return (
    <Section
      title="Quick actions"
      icon={<Zap size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={onViewAll ? <SectionAction label="View all" onPress={onViewAll} /> : undefined}
      fill
      style={style}
      contentStyle={styles.panelBody}
      testID="dash-quick-actions"
    >
      {orbs}
    </Section>
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
      {
        id: "reports",
        label: "Reports",
        icon: BarChart3,
        onPress: () => router.push("/insights" as Href),
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
  gridTwoRows: {
    flexWrap: "wrap",
    justifyContent: "flex-start",
    rowGap: 14,
  },
  gridPanel: {
    paddingHorizontal: 0,
    gap: 8,
  },
  actionPanel: {
    paddingVertical: 8,
    borderRadius: 14,
  },
  orbPanel: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  panelBody: {
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  orb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
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
