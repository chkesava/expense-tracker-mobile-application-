import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PiggyBank } from "lucide-react-native";

import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  Money,
  Section,
  StatTile,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { Input } from "@/components/ui/Input";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { PaymentMethod } from "@/shared/types/ganesh";
import {
  committeePayStatus,
  effectiveCommitteeTarget,
  memberRemainingContribution,
} from "@/shared/utils/ganeshMath";

const METHOD_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function AddMemberPaymentScreen() {
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { memberId: memberIdParam } = useLocalSearchParams<{ memberId?: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { members: pandalMembers } = usePandalMembers(pandalId);
  const { members: festivalMembers } = useFestivalMembers(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const committee = pandalMembers.filter(
    (member) => member.status === "active" || member.status == null
  );

  const [_memberId, setMemberId] = useState<string | undefined>(undefined);
  const memberId = _memberId ?? memberIdParam ?? committee[0]?.userId ?? "";
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [busy, setBusy] = useState(false);

  const selected = committee.find((member) => member.userId === memberId);
  const festivalMember = festivalMembers.find((member) => member.userId === memberId);
  const defaultTarget = festival?.contributionTargetAmount ?? 0;
  const paid = festivalMember?.contributionPaid ?? 0;
  const target = effectiveCommitteeTarget(festivalMember, defaultTarget);
  const overridden = Boolean(festivalMember?.contributionTargetOverridden);
  const due = memberRemainingContribution({
    contributionPaid: paid,
    contributionTarget: target,
  });
  const status = committeePayStatus(paid, target, overridden);

  const memberOptions = useMemo(
    () => committee.map((member) => ({ id: member.userId, label: member.displayName })),
    [committee]
  );

  if (!can("contributions.create")) {
    return <GaneshWriteLock message="Your role cannot record member payments." />;
  }

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <FormShell
      title="Member payment"
      subtitle={festival?.name}
      icon={<PiggyBank size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel="Save payment"
      submitting={busy}
      submitDisabled={!selected || !amountValid}
      onSubmit={() => {
        if (!selected) return;
        setBusy(true);
        writes
          .addContribution({
            kind: "money",
            contributorName: selected.displayName,
            contributorMemberId: selected.userId,
            amount: parsedAmount,
            isCommitteeContribution: true,
            description: method,
            date: todayDateInput(),
            status: "received",
          })
          .then(() => back())
          .catch((error) => {
            logError("ganesh.memberPayment", error);
            toast.error(friendlyErrorMessage(error, "Could not save payment."));
          })
          .finally(() => setBusy(false));
      }}
      footerHint={
        <StatusStrip
          tone="info"
          message="A committee payment is cash in — it increases the God Fund."
        />
      }
    >
      <Section title="Who is paying" plain>
        <View style={styles.form}>
          <FilterChips
            label="Committee person"
            value={memberId}
            options={memberOptions}
            onChange={setMemberId}
          />
        </View>
      </Section>

      {selected ? (
        <Section
          title={selected.displayName}
          badge={
            <StatusBadge
              kind={status === "pending" ? "pending" : status}
              label={status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Not paid"}
            />
          }
        >
          <View style={styles.statRow}>
            <StatTile label="Paid so far">
              <Money value={paid} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
            </StatTile>
            <StatTile label="Target">
              <Money value={target} size="primary" numberOfLines={1} adjustsFontSizeToFit />
            </StatTile>
            <StatTile label="Due">
              <Money
                value={due}
                size="primary"
                tone={due > 0 ? "warning" : "default"}
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
            placeholder={due > 0 ? String(due) : "0"}
            autoFocus
          />
          <FilterChips
            label="Payment method"
            value={method}
            options={METHOD_OPTIONS}
            onChange={setMethod}
          />
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
