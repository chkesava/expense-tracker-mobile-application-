import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
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

const METHODS: PaymentMethod[] = ["cash", "upi", "bank", "other"];

export default function AddMemberPaymentScreen() {
  const { theme } = useTheme();
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

  if (!can("contributions.create")) {
    return <GaneshWriteLock message="Your role cannot record member payments." />;
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Record a committee payment for this festival. It increases the God Fund.
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Committee person</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {committee.map((member) => (
          <Pressable
            key={member.userId}
            onPress={() => setMemberId(member.userId)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: memberId === member.userId ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: memberId === member.userId ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
              }}
            >
              {member.displayName}
            </Text>
          </Pressable>
        ))}
      </View>
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {METHODS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setMethod(item)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: method === item ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: method === item ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
                textTransform: "capitalize",
              }}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
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
      >
        Save member payment
      </Button>
    </GaneshScreen>
  );
}
