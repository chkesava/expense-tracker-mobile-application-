import { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Landmark } from "lucide-react-native";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { CLOSED_FESTIVAL_WRITE_MESSAGE } from "@/shared/utils/ganeshFestivalStatus";
import type { OpeningFundSource } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const SOURCE_OPTIONS: Array<{ id: OpeningFundSource; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "previous_balance", label: "Previous balance" },
  { id: "other", label: "Other" },
];

export default function AddOpeningFundScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { closed } = useFestivalWriteLock();
  const [amount, setAmount] = useState("");
  const [sourceType, setSourceType] = useState<OpeningFundSource>("cash");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  if (!can("openingFunds.create")) {
    return <GaneshWriteLock message="Your role cannot add opening funds." />;
  }
  if (closed) {
    return <GaneshWriteLock message={CLOSED_FESTIVAL_WRITE_MESSAGE} />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Opening fund"
        icon={<Landmark size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 21 }}>
        Opening funds are the starting God Fund, not a new donation.
      </Text>
      <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <ChoiceChips
        label="Source"
        value={sourceType}
        options={SOURCE_OPTIONS}
        onChange={setSourceType}
      />
      <FormDetails>
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Previous Ganesh fund balance"
        />
      </FormDetails>
      <Button
        loading={busy}
        onPress={() => {
          setBusy(true);
          writes
            .addOpeningFund({
              amount: Number(amount),
              sourceType,
              description,
              date: todayDateInput(),
            })
            .then(() => back())
            .catch((error) => {
              logError("ganesh.addOpeningFund", error);
              toast.error(friendlyErrorMessage(error, "Could not save opening fund."));
            })
            .finally(() => setBusy(false));
        }}
      >
        Save opening fund
      </Button>
    </GaneshScreen>
  );
}
