import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { ContributionKind, ContributionStatus } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const KINDS: ContributionKind[] = ["money", "item", "service", "sponsorship"];
const STATUSES: ContributionStatus[] = ["promised", "received", "cancelled"];

export default function AddContributionScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const [kind, setKind] = useState<ContributionKind>("item");
  const [status, setStatus] = useState<ContributionStatus>("received");
  const [contributorName, setContributorName] = useState("");
  const [mobile, setMobile] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  if (!can("contributions.create")) {
    return <GaneshWriteLock message="Your role cannot add contributions." />;
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Contributor is who gave the item or money. You are only recording it.
      </Text>
      <Chip value={kind} options={KINDS} onChange={setKind} />
      {kind !== "money" ? <Chip value={status} options={STATUSES} onChange={setStatus} /> : null}
      <Input label="Contributor" value={contributorName} onChangeText={setContributorName} placeholder="Suresh Kumar" />
      <Input label="Mobile (optional)" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
      {kind !== "money" ? (
        <>
          <Input label="Item / service" value={itemName} onChangeText={setItemName} placeholder="Ganesh Idol" />
          <Input label="Quantity (optional)" value={quantity} onChangeText={setQuantity} placeholder="1" />
          <Input
            label="Estimated value"
            value={estimatedValue}
            onChangeText={setEstimatedValue}
            keyboardType="numeric"
          />
        </>
      ) : (
        <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      )}
      <Input label="Description (optional)" value={description} onChangeText={setDescription} />
      <Button
        loading={busy}
        onPress={() => {
          setBusy(true);
          writes
            .addContribution({
              kind,
              contributorName,
              mobile,
              itemName,
              quantity,
              amount: Number(amount || 0),
              estimatedValue: Number(estimatedValue || 0),
              description,
              date: todayDateInput(),
              status: kind === "money" ? "received" : status,
            })
            .then(() => back())
            .catch((error) => {
              logError("ganesh.addContribution", error);
              toast.error(friendlyErrorMessage(error, "Could not save contribution."));
            })
            .finally(() => setBusy(false));
        }}
      >
        Save contribution
      </Button>
    </GaneshScreen>
  );
}

function Chip<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onChange(option)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: value === option ? theme.colors.primary : theme.colors.muted,
          }}
        >
          <Text
            style={{
              color: value === option ? theme.colors.primaryForeground : theme.colors.foreground,
              fontWeight: "700",
              textTransform: "capitalize",
            }}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
