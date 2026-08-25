import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";

import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { OpeningFundSource } from "@/shared/types/ganesh";

const SOURCE_OPTIONS: Array<{ id: OpeningFundSource; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "previous_balance", label: "Previous balance" },
  { id: "other", label: "Other" },
];

export default function AddOpeningFundScreen() {
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const [amount, setAmount] = useState("");
  const [sourceType, setSourceType] = useState<OpeningFundSource>("cash");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  if (!can("openingFunds.create")) {
    return <GaneshWriteLock message="Your role cannot add opening funds." />;
  }

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <FormShell
      title="Opening fund"
      subtitle={festival?.name}
      icon={<Sparkles size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel="Save opening fund"
      submitting={busy}
      submitDisabled={!amountValid}
      onSubmit={() => {
        setBusy(true);
        writes
          .addOpeningFund({
            amount: parsedAmount,
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
      <StatusStrip
        tone="info"
        message="An opening fund is the money this festival starts with — not a new donation."
      />

      <Section title="Opening balance" plain>
        <View style={styles.form}>
          <Input
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0"
            autoFocus
          />
          <FilterChips
            label="Source"
            value={sourceType}
            options={SOURCE_OPTIONS}
            onChange={setSourceType}
          />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Previous Ganesh fund balance"
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
});
