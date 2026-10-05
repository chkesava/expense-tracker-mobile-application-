import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { ChipRow } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { shiftDateKey } from "@/shared/utils/dates";
import {
  buildWhatIfChange,
  nextMonthStart,
  WHAT_IF_CHANGE_INFO,
  WHAT_IF_CHANGE_TYPES,
  type WhatIfChangeForm,
  type WhatIfChangeType,
} from "@/shared/utils/whatIfDraft";
import { useTheme } from "@/theme/ThemeProvider";

const MONTHLY_TYPES: WhatIfChangeType[] = ["income_change", "expense_change", "savings"];

/**
 * Add one change to a What-If scenario (SPENDLY-387). The form is validated
 * with the same builders that produce the engine adjustments, so what the
 * sheet accepts is exactly what the projection runs.
 */
export function WhatIfChangeSheet({
  isOpen,
  onClose,
  today,
  initial,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  today: string;
  /** Pre-filled form (from a template); null = start with a type picker. */
  initial: Partial<WhatIfChangeForm> | null;
  onAdd: (form: WhatIfChangeForm) => void;
}) {
  const { theme } = useTheme();
  const [type, setType] = useState<WhatIfChangeType>("purchase");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [startDate, setStartDate] = useState(today);
  const [untilDate, setUntilDate] = useState("");
  const [rate, setRate] = useState("10");
  const [tenure, setTenure] = useState("12");
  const [downPayment, setDownPayment] = useState("");
  const [fees, setFees] = useState("");
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const t = initial?.type ?? "purchase";
    setType(t);
    setLabel(initial?.label ?? WHAT_IF_CHANGE_INFO[t].title);
    setAmount(initial?.amount ? String(initial.amount) : "");
    setDirection(initial?.direction ?? "increase");
    setStartDate(MONTHLY_TYPES.includes(t) ? nextMonthStart(today) : today);
    setUntilDate("");
    setRate(String(initial?.annualInterestRatePct ?? 10));
    setTenure(String(initial?.tenureMonths ?? 12));
    setDownPayment("");
    setFees("");
    setTried(false);
  }, [isOpen, initial, today]);

  const changeType = (next: WhatIfChangeType) => {
    // Keep a label the user typed; otherwise follow the type.
    if (label === WHAT_IF_CHANGE_INFO[type].title || !label.trim()) setLabel(WHAT_IF_CHANGE_INFO[next].title);
    if (MONTHLY_TYPES.includes(next) !== MONTHLY_TYPES.includes(type)) setStartDate(MONTHLY_TYPES.includes(next) ? nextMonthStart(today) : today);
    setType(next);
  };

  const num = (value: string) => Number(value.replace(/,/g, "").trim());
  const form: WhatIfChangeForm = {
    type,
    label,
    amount: num(amount),
    direction: type === "income_change" || type === "expense_change" ? direction : undefined,
    startDate: startDate.trim(),
    untilDate: MONTHLY_TYPES.includes(type) && untilDate.trim() ? untilDate.trim() : undefined,
    ...(type === "loan"
      ? { annualInterestRatePct: num(rate), tenureMonths: num(tenure), downPayment: downPayment ? num(downPayment) : undefined, fees: fees ? num(fees) : undefined }
      : {}),
  };
  const issues = useMemo(() => buildWhatIfChange("preview", form, today).issues, [JSON.stringify(form), today]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = WHAT_IF_CHANGE_INFO[type];
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const monthly = MONTHLY_TYPES.includes(type);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add a change" density="compact">
      <View style={{ gap: theme.space.md }}>
        <View style={{ gap: theme.space.xs }}>
          <ChipRow<WhatIfChangeType> options={WHAT_IF_CHANGE_TYPES.map((t) => ({ value: t, label: WHAT_IF_CHANGE_INFO[t].title }))} selected={type} onSelect={changeType} />
          <Text style={muted}>{info.description}</Text>
        </View>

        <Input label="Name" value={label} onChangeText={setLabel} maxLength={60} />

        {type === "income_change" || type === "expense_change" ? (
          <SegmentedControl<"increase" | "decrease">
            options={[
              { value: "increase", label: type === "income_change" ? "Earn more" : "Spend more" },
              { value: "decrease", label: type === "income_change" ? "Earn less" : "Spend less" },
            ]}
            value={direction}
            onChange={setDirection}
          />
        ) : null}

        <Input label={info.amountLabel} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" />

        <View style={{ gap: theme.space.xs }}>
          <Input label={`${info.dateLabel} (YYYY-MM-DD)`} value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
          <ChipRow<string>
            options={[
              { value: today, label: "Today" },
              { value: nextMonthStart(today), label: "Next month" },
              { value: nextMonthStart(nextMonthStart(nextMonthStart(today))), label: "In 3 months" },
              { value: shiftDateKey(today, 30), label: "In 30 days" },
            ]}
            selected={startDate}
            onSelect={setStartDate}
          />
        </View>

        {monthly ? (
          <Input label="Until (optional, YYYY-MM-DD)" value={untilDate} onChangeText={setUntilDate} autoCapitalize="none" helperText="Leave empty to keep it going." />
        ) : null}

        {type === "loan" ? (
          <View style={{ gap: theme.space.md }}>
            <View style={{ flexDirection: "row", gap: theme.space.sm }}>
              <Input label="Interest (% a year)" value={rate} onChangeText={setRate} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              <Input label="Tenure (months)" value={tenure} onChangeText={setTenure} keyboardType="numeric" containerStyle={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: "row", gap: theme.space.sm }}>
              <Input label="Down payment" value={downPayment} onChangeText={setDownPayment} keyboardType="numeric" placeholder="Optional" containerStyle={{ flex: 1 }} />
              <Input label="Fees" value={fees} onChangeText={setFees} keyboardType="numeric" placeholder="Optional" containerStyle={{ flex: 1 }} />
            </View>
            <Text style={muted}>The EMI is worked out with a reducing-balance loan at a fixed rate.</Text>
          </View>
        ) : null}

        {tried && issues.length ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 2 }}>
            {issues.map((issue) => (
              <Text key={issue} style={{ color: theme.colors.destructive, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
                {issue}
              </Text>
            ))}
          </View>
        ) : null}

        <Button
          onPress={() => {
            setTried(true);
            if (issues.length) return;
            onAdd(form);
          }}
          accessibilityLabel={`Add ${label || "change"}`}
        >
          Add change
        </Button>
      </View>
    </Modal>
  );
}
