import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { DuplicateHouseholdDialog } from "@/components/ganesh/DuplicateHouseholdDialog";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { possibleHouseholdDuplicates } from "@/shared/utils/ganeshMath";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { PaymentMethod } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const METHODS: PaymentMethod[] = ["cash", "upi", "bank", "other"];

export default function AddCollectionScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const { realUser } = useAuth();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { members } = usePandalMembers(pandalId);
  const { households } = useHouseholds(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [collectorId, setCollectorId] = useState(realUser?.uid ?? "");
  const [mobile, setMobile] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<typeof households>([]);

  const payload = useMemo(
    () => ({
      donorName,
      amount: Number(amount),
      paymentMethod: method,
      collectorId: collectorId || realUser?.uid || "",
      date: todayDateInput(),
      mobile,
      houseNumber,
      address,
      notes,
      expectedAmount: festival?.householdTargetAmount ?? 0,
      createHousehold: true,
    }),
    [address, amount, collectorId, donorName, festival?.householdTargetAmount, houseNumber, method, mobile, notes, realUser?.uid]
  );

  const save = async () => {
    setBusy(true);
    try {
      await writes.addCollection(payload);
      back();
    } catch (error) {
      logError("ganesh.addCollection", error);
      toast.error(friendlyErrorMessage(error, "Could not save collection."));
    } finally {
      setBusy(false);
      setMatches([]);
    }
  };

  const onSubmit = () => {
    const foundIds = new Set(
      possibleHouseholdDuplicates(households, { name: donorName, houseNumber, mobile }).map(
        (household) => household.id
      )
    );
    const found = households.filter((household) => foundIds.has(household.id));
    if (found.length > 0) {
      setMatches(found);
      return;
    }
    void save();
  };

  if (!can("collections.create")) {
    return <GaneshWriteLock message="Your role cannot add collections." />;
  }

  return (
    <GaneshScreen>
      <Input label="Name" value={donorName} onChangeText={setDonorName} placeholder="Ramesh Kumar" />
      <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="500" />
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Payment method</Text>
      <ChipRow value={method} options={METHODS} onChange={(value) => setMethod(value as PaymentMethod)} />
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Collected by</Text>
      <ChipRow
        value={collectorId}
        options={members.map((member) => member.userId)}
        labels={Object.fromEntries(members.map((member) => [member.userId, member.displayName]))}
        onChange={setCollectorId}
      />
      <Input label="Mobile (optional)" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
      <Input label="House number (optional)" value={houseNumber} onChangeText={setHouseNumber} />
      <Input label="Address / area (optional)" value={address} onChangeText={setAddress} />
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} />
      <Button loading={busy} onPress={onSubmit}>
        Save collection
      </Button>
      {matches.length > 0 ? (
        <DuplicateHouseholdDialog
          matches={matches}
          onCancel={() => setMatches([])}
          onContinue={() => void save()}
        />
      ) : null}
    </GaneshScreen>
  );
}

function ChipRow({
  value,
  options,
  labels,
  onChange,
}: {
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
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
            {labels?.[option] ?? option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
