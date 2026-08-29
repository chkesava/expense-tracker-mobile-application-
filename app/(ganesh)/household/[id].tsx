import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Home } from "lucide-react-native";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  FilterChips,
  GaneshEmptyState,
  GaneshHeader,
  Money,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCollections } from "@/hooks/useCollections";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import type { HouseholdStatus } from "@/shared/types/ganesh";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS_OPTIONS: Array<{ id: HouseholdStatus; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "partial", label: "Partial" },
  { id: "paid", label: "Paid" },
  { id: "not_interested", label: "Not interested" },
  { id: "not_available", label: "Not available" },
];

export default function HouseholdDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { households } = useHouseholds(pandalId, festivalId);
  const { collections } = useCollections(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const canUpdate = can("collections.update");
  const canVoid = can("expenses.void");
  const household = households.find((item) => item.id === id);
  const history = collections.filter((row) => row.householdId === id && !row.voided);
  const [expected, setExpected] = useState(String(household?.expectedAmount ?? 0));

  if (!household) {
    return (
      <GaneshScreen>
        <GaneshHeader
          title="Household"
          icon={<Home size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshEmptyState
          icon={<Home size={22} color={g.saffron} strokeWidth={2.2} />}
          title="Household not found"
          description="It may belong to another festival, or it was removed."
        />
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title={household.name}
        subtitle={[
          household.houseNumber ? `House ${household.houseNumber}` : null,
          household.status.replace("_", " "),
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={<Home size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Money value={household.collectedAmount} size="title" />
      {canUpdate ? (
        <>
          <Input label="Expected amount" value={expected} onChangeText={setExpected} keyboardType="numeric" />
          <Button
            onPress={() => {
              void writes.updateHousehold(household.id, { expectedAmount: Number(expected) });
            }}
          >
            Save expected
          </Button>
          <FilterChips
            label="Status"
            layout="wrap"
            value={household.status}
            options={STATUS_OPTIONS}
            onChange={(status) => {
              void writes.updateHousehold(household.id, { status });
            }}
          />
        </>
      ) : null}
      <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }}>
        Collection history
      </Text>
      {history.length === 0 ? (
        <GaneshEmptyState
          compact
          icon={<Home size={20} color={g.saffron} strokeWidth={2.2} />}
          title="No collections yet"
          description="Chanda recorded for this house will show here."
        />
      ) : (
        history.map((row) => (
          <View
            key={row.id}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              padding: 14,
              gap: 4,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderCurve: "continuous",
            }}
          >
            <Money value={row.amount} size="primary" />
            <AccountabilityLine
              collectedBy={memberDisplayName(members, row.collectorId)}
              enteredBy={memberDisplayName(members, row.createdBy)}
              at={row.createdAt}
              date={row.date}
            />
            {canVoid ? (
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
            ) : null}
          </View>
        ))
      )}
    </GaneshScreen>
  );
}
