import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { PaymentMethod } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const METHODS: PaymentMethod[] = ["cash", "upi", "bank", "other"];

export default function AddReimbursementScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { members } = useFestivalMembers(pandalId, festivalId);
  const writes = useGaneshWrites();
  const [memberId, setMemberId] = useState(params.memberId ?? members[0]?.userId ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = members.find((member) => member.userId === memberId);

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Reimbursement reduces God Fund and pending personal money.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {members.map((member) => (
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
          Pending {formatInr(selected.pendingReimbursement)}
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
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} />
      <Button
        loading={busy}
        onPress={() => {
          if (!selected) return;
          setBusy(true);
          writes
            .addReimbursement({
              memberId: selected.userId,
              amount: Number(amount),
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
      >
        Save reimbursement
      </Button>
    </GaneshScreen>
  );
}
