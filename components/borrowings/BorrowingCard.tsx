import { memo } from "react";
import { Building2, CreditCard, Landmark, User } from "lucide-react-native";

import { DebtCard } from "@/components/common/DebtCard";
import { useSettings } from "@/providers/SettingsProvider";
import type { Borrowing, BorrowingStatus, LenderType } from "@/shared/types/borrowing";
import { LENDER_TYPE_LABELS } from "@/shared/types/borrowing";
import {
  describeInterest,
  type BorrowingSummary,
} from "@/shared/utils/borrowingMath";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { debtStatusTone, settledPercent } from "@/shared/utils/debtPresentation";
import { useTheme } from "@/theme/ThemeProvider";

const CARD_STATUS_LABELS: Record<BorrowingStatus, string> = {
  ACTIVE: "Active",
  PARTIALLY_SETTLED: "Partial",
  FULLY_SETTLED: "Paid",
  OVERDUE: "Overdue",
  CLOSED: "Closed",
};

type Colors = ReturnType<typeof useTheme>["theme"]["colors"];

/** SPENDLY-536: a semantic theme tint per lender type, replacing fixed rgba fills. */
function lenderAvatar(type: LenderType, colors: Colors): { tint: string; Icon: typeof User } {
  switch (type) {
    case "BANK":
      return { tint: colors.primary, Icon: Landmark };
    case "FINANCE_INSTITUTION":
      return { tint: colors.warning, Icon: Building2 };
    case "CREDIT_CARD":
      return { tint: colors.destructive, Icon: CreditCard };
    case "FRIEND":
      return { tint: colors.info, Icon: User };
    case "FAMILY":
      return { tint: colors.success, Icon: User };
    default:
      return { tint: colors.mutedForeground, Icon: User };
  }
}

/**
 * One borrowing in the Money hub (SPENDLY-536), drawn by the shared `DebtCard`.
 * Same props and figures as before; the menu and the repayment action are now
 * siblings of the card body instead of pressables nested inside it.
 */
export const BorrowingCard = memo(function BorrowingCard({
  borrowing,
  summary,
  currency,
  onPress,
  onMenu,
  onRecordRepayment,
}: {
  borrowing: Borrowing;
  summary: BorrowingSummary;
  currency?: string;
  onPress: (id: string) => void;
  onMenu: (id: string) => void;
  onRecordRepayment: (id: string) => void;
}) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const id = borrowing.id ?? "";
  const avatar = lenderAvatar(borrowing.lenderType, theme.colors);
  const AvatarIcon = avatar.Icon;
  const repaidPct = settledPercent(summary.principalPaid, summary.principalAmount);
  // Mirrors the list's own guard: a fully settled or closed borrowing has
  // nothing left to repay, so it must not offer the action.
  const settled = summary.status === "FULLY_SETTLED" || summary.status === "CLOSED";

  return (
    <DebtCard
      icon={<AvatarIcon size={17} color={avatar.tint} strokeWidth={2.2} />}
      tint={avatar.tint}
      headline={summary.principalAmount}
      title={borrowing.lenderName}
      meta={`${LENDER_TYPE_LABELS[borrowing.lenderType]} · ${describeInterest(borrowing)}`}
      status={{ word: CARD_STATUS_LABELS[summary.status], tone: debtStatusTone(summary.status) }}
      progress={{ pct: repaidPct, label: `${Math.round(repaidPct)}% of principal repaid` }}
      figures={[
        {
          label: "Outstanding",
          value: summary.totalOutstanding,
          tone: summary.status === "OVERDUE" ? "negative" : "default",
        },
        { label: "Repaid", value: summary.totalPaid, tone: "positive" },
      ]}
      due={
        borrowing.dueDate
          ? {
              text: `${summary.isOverdue ? "Was due" : "Due"} ${formatDisplayDate(borrowing.dueDate, settings.dateFormat)}`,
              overdue: summary.isOverdue,
            }
          : null
      }
      currency={currency}
      onPress={() => {
        if (id) onPress(id);
      }}
      accessibilityLabel={`Borrowing from ${borrowing.lenderName}`}
      action={
        settled || !id
          ? null
          : {
              label: "Record repayment",
              accessibilityLabel: `Record repayment for ${borrowing.lenderName}`,
              onPress: () => onRecordRepayment(id),
            }
      }
      menu={
        id
          ? { accessibilityLabel: `Actions for ${borrowing.lenderName}`, onPress: () => onMenu(id) }
          : null
      }
    />
  );
});
