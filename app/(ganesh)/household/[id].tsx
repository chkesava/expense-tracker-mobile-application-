import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCollections } from "@/hooks/useCollections";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import type { HouseholdStatus } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const STATUSES: HouseholdStatus[] = [
  "pending",
  "partial",
  "paid",
  "not_interested",
  "not_available",
];

export default function HouseholdDetailScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { households } = useHouseholds(pandalId, festivalId);
  const { collections } = useCollections(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const household = households.find((item) => item.id === id);
  const history = collections.filter((row) => row.householdId === id && !row.voided);
  const [expected, setExpected] = useState(String(household?.expectedAmount ?? 0));

  if (!household) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.mutedForeground }}>Household not found.</Text>
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 24, fontWeight: "800" }}>
        {household.name}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {household.houseNumber ? `House ${household.houseNumber} · ` : ""}
        {household.status.replace("_", " ")}
      </Text>
      <Text style={{ color: theme.colors.primary, fontSize: 28, fontWeight: "800" }}>
        {formatInr(household.collectedAmount)}
      </Text>
      <Input label="Expected amount" value={expected} onChangeText={setExpected} keyboardType="numeric" />
      <Button
        onPress={() => {
          void writes.updateHousehold(household.id, { expectedAmount: Number(expected) });
        }}
      >
        Save expected
      </Button>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {STATUSES.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={household.status === status ? "primary" : "outline"}
            onPress={() => {
              void writes.updateHousehold(household.id, { status });
            }}
          >
            {status.replace("_", " ")}
          </Button>
        ))}
      </View>
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Collection history</Text>
      {history.map((row) => (
        <View
          key={row.id}
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 16,
            padding: 14,
            gap: 4,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>{formatInr(row.amount)}</Text>
          <AccountabilityLine
            collectedBy={memberDisplayName(members, row.collectorId)}
            enteredBy={memberDisplayName(members, row.createdBy)}
            at={row.createdAt}
            date={row.date}
          />
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              void writes.voidFinancialRecord({
                entityType: "collection",
                entityId: row.id,
                reason: "Voided from household history",
              });
            }}
          >
            Void
          </Button>
        </View>
      ))}
    </GaneshScreen>
  );
}
