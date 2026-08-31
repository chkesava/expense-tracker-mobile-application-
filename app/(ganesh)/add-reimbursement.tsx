import { useRef, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Wallet } from "lucide-react-native";

import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { FilterChips, GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { CLOSED_FESTIVAL_WRITE_MESSAGE } from "@/shared/utils/ganeshFestivalStatus";
import type { PaymentMethod } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";
import { newId } from "@/lib/id";

const METHOD_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function AddReimbursementScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { members } = useFestivalMembers(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { closed } = useFestivalWriteLock();
  const [memberId, setMemberId] = useState(params.memberId ?? members[0]?.userId ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const clientOpIdRef = useRef<string | null>(null);
  const selected = members.find((member) => member.userId === memberId);

  if (!can("reimbursements.create")) {
    return <GaneshWriteLock message="Only a Pandal Admin or Treasurer can reimburse members." />;
  }
  if (closed) {
    return <GaneshWriteLock message={CLOSED_FESTIVAL_WRITE_MESSAGE} />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Reimburse"
        icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 21 }}>
        Reimbursement reduces God Fund and pending personal money.
      </Text>
      <FilterChips
        label="Member"
        layout="wrap"
        value={memberId}
        options={members.map((member) => ({ id: member.userId, label: member.displayName }))}
        onChange={setMemberId}
      />
      {selected ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Pending {formatInr(selected.pendingReimbursement)}
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
      <FormDetails>
        <Input label="Notes (optional)" value={notes} onChangeText={setNotes} />
      </FormDetails>
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
              clientOpId: clientOpIdRef.current ?? (clientOpIdRef.current = newId()),
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
