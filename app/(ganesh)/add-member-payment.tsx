import { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Users } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { FilterChips, GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { Button } from "@/components/ui/Button";
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
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

const METHOD_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function AddMemberPaymentScreen() {
  const { theme } = useTheme();
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
  const { closed, lockMessage } = useFestivalWriteLock();
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

  if (!can("contributions.create")) {
    return <GaneshWriteLock message="Your role cannot record member payments." />;
  }
  if (closed) {
    return <GaneshWriteLock message={lockMessage} />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Member payment"
        icon={<Users size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 21 }}>
        Record a committee payment for this festival. It increases the God Fund.
      </Text>
      <FilterChips
        label="Committee person"
        layout="wrap"
        value={memberId}
        options={committee.map((member) => ({ id: member.userId, label: member.displayName }))}
        onChange={setMemberId}
      />
      {selected ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          {selected.displayName} · {status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Not paid"}
          {" · "}
          {formatInr(paid)}
          {target > 0 ? ` / ${formatInr(target)}` : ""}
          {due > 0 ? ` · due ${formatInr(due)}` : ""}
        </Text>
      ) : null}
      <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <FilterChips
        label="Method"
        layout="wrap"
        value={method}
        options={METHOD_OPTIONS}
        onChange={setMethod}
      />
      <Button
        loading={busy}
        onPress={() => {
          if (!selected) return;
          setBusy(true);
          writes
            .addContribution({
              kind: "money",
              contributorName: selected.displayName,
              contributorMemberId: selected.userId,
              amount: Number(amount),
              isCommitteeContribution: true,
              paymentMethod: method,
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
      >
        Save member payment
      </Button>
    </GaneshScreen>
  );
}
