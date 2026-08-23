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
import type { OpeningFundSource } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const SOURCES: OpeningFundSource[] = ["cash", "upi", "bank", "previous_balance", "other"];

export default function AddOpeningFundScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const [amount, setAmount] = useState("");
  const [sourceType, setSourceType] = useState<OpeningFundSource>("cash");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  if (!can("openingFunds.create")) {
    return <GaneshWriteLock message="Your role cannot add opening funds." />;
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Opening funds are the starting God Fund, not a new donation.
      </Text>
      <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Source</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {SOURCES.map((source) => (
          <Pressable
            key={source}
            onPress={() => setSourceType(source)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: sourceType === source ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: sourceType === source ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
                textTransform: "capitalize",
              }}
            >
              {source.replace("_", " ")}
            </Text>
          </Pressable>
        ))}
      </View>
      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Previous Ganesh fund balance"
      />
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
