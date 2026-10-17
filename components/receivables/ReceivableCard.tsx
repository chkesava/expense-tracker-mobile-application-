import React from "react";
import { UserRound } from "lucide-react-native";

import { DebtCard } from "@/components/common/DebtCard";
import { useSettings } from "@/providers/SettingsProvider";
import type { Receivable } from "@/shared/types/receivable";
import {
  PERSON_TYPE_LABELS,
  RECEIVABLE_STATUS_LABELS,
} from "@/shared/types/receivable";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { debtStatusTone, settledPercent } from "@/shared/utils/debtPresentation";
import {
  describeInterest,
  type ReceivableSummary,
} from "@/shared/utils/receivableMath";
import { useTheme } from "@/theme/ThemeProvider";

export interface ReceivableCardProps {
  receivable: Receivable;
  summary: ReceivableSummary;
  currency?: string;
  onPress: () => void;
  onRecordRepayment: () => void;
}

/**
 * One money-lent entry (SPENDLY-536), drawn by the shared `DebtCard`. Same
 * props and figures as before. Amounts now respect hidden-amounts mode (the old
 * card's `Amount`s were not ghostable), and the repayment action is a sibling
 * of the card body rather than a pressable nested inside it.
 */
export function ReceivableCard({
  receivable,
  summary,
  currency,
  onPress,
  onRecordRepayment,
}: ReceivableCardProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  // Measured against principal plus accrued interest, or the bar would read
  // 100% while interest was still owed (SPENDLY-160).
  const collectable = summary.originalAmount + summary.interestAccrued;
  const receivedPct = settledPercent(summary.totalReceived, collectable);
  // Nothing left to collect on a settled or cancelled receivable.
  const closed =
    summary.status === "FULLY_SETTLED" || summary.status === "CANCELLED";

  return (
    <DebtCard
      icon={<UserRound size={17} color={theme.colors.info} strokeWidth={2.2} />}
      tint={theme.colors.info}
      title={receivable.personName}
      meta={
        PERSON_TYPE_LABELS[receivable.personType] +
        (summary.interestAccrued > 0 ? ` · ${describeInterest(receivable)}` : "")
      }
      status={{
        word: RECEIVABLE_STATUS_LABELS[summary.status],
        tone: debtStatusTone(summary.status),
      }}
      progress={{ pct: receivedPct, label: `${Math.round(receivedPct)}% received back` }}
      figures={[
        {
          label: "Outstanding",
          value: summary.outstandingAmount,
          tone: summary.status === "OVERDUE" ? "negative" : "default",
        },
        { label: "Original", value: summary.originalAmount, tone: "muted" },
        { label: "Received", value: summary.totalReceived, tone: "positive" },
      ]}
      due={
        receivable.dueDate
          ? {
              text: `${summary.isOverdue ? "Was due" : "Due"} ${formatDisplayDate(receivable.dueDate, settings.dateFormat)}`,
              overdue: summary.isOverdue,
            }
          : null
      }
      currency={currency}
      onPress={onPress}
      accessibilityLabel={`Money lent to ${receivable.personName}`}
      action={
        closed
          ? null
          : {
              label: "Record repayment",
              accessibilityLabel: `Record repayment from ${receivable.personName}`,
              onPress: onRecordRepayment,
            }
      }
    />
  );
}
