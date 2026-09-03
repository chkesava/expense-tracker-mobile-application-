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
import type { OpeningFundSource } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const SOURCE_OPTIONS: Array<{ id: OpeningFundSource; label: string }> = [
  { id: "previous_balance", label: "Previous balance" },
  { id: "cash", label: "Cash on hand" },
  { id: "upi", label: "UPI leftover" },
  { id: "bank", label: "Bank leftover" },
  { id: "other", label: "Other" },
];

export default function AddOpeningFundScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { closed, lockMessage } = useFestivalWriteLock();
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [bank, setBank] = useState("");
  const [other, setOther] = useState("");
  const [sourceType, setSourceType] = useState<OpeningFundSource>("previous_balance");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  if (!can("openingFunds.create")) {
    return <GaneshWriteLock message="Your role cannot add opening funds." />;
  }
  if (closed) {
    return <GaneshWriteLock message={lockMessage} />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Opening fund"
        icon={<Landmark size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 21 }}>
        Opening funds are the starting God Fund, not a new donation. Enter where that money is
        held — Cash, UPI, Bank, or Other.
      </Text>
      <Input label="Cash" value={cash} onChangeText={setCash} keyboardType="numeric" />
      <Input label="UPI" value={upi} onChangeText={setUpi} keyboardType="numeric" />
      <Input label="Bank" value={bank} onChangeText={setBank} keyboardType="numeric" />
      <Input label="Other" value={other} onChangeText={setOther} keyboardType="numeric" />
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
            .addOpeningFunds({
              amounts: {
                cash: Number(cash || 0),
                upi: Number(upi || 0),
                bank: Number(bank || 0),
                other: Number(other || 0),
              },
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
