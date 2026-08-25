import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { HandCoins } from "lucide-react-native";

import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  Money,
  Section,
  StatTile,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { Input } from "@/components/ui/Input";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { PaymentMethod } from "@/shared/types/ganesh";

const METHOD_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function AddReimbursementScreen() {
  const g = useGaneshTokens();
  const { back } = useRouter();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { members } = useFestivalMembers(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const [memberId, setMemberId] = useState(params.memberId ?? members[0]?.userId ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = members.find((member) => member.userId === memberId);

  /** People who are actually owed money come first — that is why you are here. */
  const memberOptions = useMemo(
    () =>
      members
        .slice()
        .sort((a, b) => b.pendingReimbursement - a.pendingReimbursement)
        .map((member) => ({
          id: member.userId,
          label: member.displayName,
          badge:
            member.pendingReimbursement > 0
              ? formatInr(member.pendingReimbursement)
              : undefined,
        })),
    [members]
  );

  if (!can("reimbursements.create")) {
    return <GaneshWriteLock message="Only a Pandal Admin or Treasurer can reimburse members." />;
  }

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const overPaying = Boolean(selected && parsedAmount > selected.pendingReimbursement);

  return (
    <FormShell
      title="Reimburse"
      subtitle={selected?.displayName}
      icon={<HandCoins size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel="Save reimbursement"
      submitting={busy}
      submitDisabled={!selected || !amountValid}
      onSubmit={() => {
        if (!selected) return;
        setBusy(true);
        writes
          .addReimbursement({
            memberId: selected.userId,
            amount: parsedAmount,
            paymentMethod: method,
            date: todayDateInput(),
            notes,
            pendingPersonalExpense: selected.pendingReimbursement,
          })
          .then(() => back())
          .catch((error) => {
            logError("ganesh.reimburse", error);
            toast.error(friendlyErrorMessage(error, "Could not save reimbursement."));
          })
          .finally(() => setBusy(false));
      }}
      footerHint={
        overPaying ? (
          <StatusStrip
            tone="warning"
            message={`This is more than the ${formatInr(
              selected?.pendingReimbursement ?? 0
            )} currently pending.`}
          />
        ) : (
          <StatusStrip
            tone="info"
            message="A reimbursement pays a member back. It reduces the God Fund and the pending personal money."
          />
        )
      }
    >
      <Section title="Who is being paid back" plain>
        <View style={styles.form}>
          <FilterChips
            label="Member"
            value={memberId}
            options={memberOptions}
            onChange={setMemberId}
          />
        </View>
      </Section>

      {selected ? (
        <Section title={selected.displayName}>
          <View style={styles.statRow}>
            <StatTile label="Personal money spent">
              <Money
                value={selected.personalExpenses}
                size="primary"
                numberOfLines={1}
                adjustsFontSizeToFit
              />
            </StatTile>
            <StatTile label="Already reimbursed">
              <Money
                value={selected.reimbursed}
                size="primary"
                numberOfLines={1}
                adjustsFontSizeToFit
              />
            </StatTile>
            <StatTile label="Still owed">
              <Money
                value={selected.pendingReimbursement}
                size="primary"
                tone={selected.pendingReimbursement > 0 ? "warning" : "default"}
                numberOfLines={1}
                adjustsFontSizeToFit
              />
            </StatTile>
          </View>
        </Section>
      ) : null}

      <Section title="Payment" plain>
        <View style={styles.form}>
          <Input
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder={
              selected && selected.pendingReimbursement > 0
                ? String(selected.pendingReimbursement)
                : "0"
            }
            autoFocus
          />
          <FilterChips
            label="Payment method"
            value={method}
            options={METHOD_OPTIONS}
            onChange={setMethod}
          />
          <Input label="Notes (optional)" value={notes} onChangeText={setNotes} />
        </View>
      </Section>
    </FormShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
});
