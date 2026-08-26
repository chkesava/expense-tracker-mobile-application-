import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Home as HomeIcon, IndianRupee, Smartphone } from "lucide-react-native";

import { accountabilityText } from "@/components/ganesh/AccountabilityLine";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  FilterChips,
  FundHero,
  GaneshHeader,
  LedgerRow,
  ProgressTrack,
  Section,
  StatusBadge,
  useGaneshTokens,
  type LedgerRowBadge,
} from "@/components/ganesh/ui";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCollections } from "@/hooks/useCollections";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
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

function householdBadge(status: HouseholdStatus): LedgerRowBadge {
  switch (status) {
    case "paid":
      return { kind: "paid" };
    case "partial":
      return { kind: "partial" };
    case "not_interested":
      return { kind: "cancelled", label: "Not interested" };
    case "not_available":
      return { kind: "neutral", label: "Not available" };
    default:
      return { kind: "pending" };
  }
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
  other: "Other",
};

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
  const [editing, setEditing] = useState(false);

  if (!household) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Household"
          icon={<HomeIcon size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <EmptyState
          illustration="search"
          title="Household not found"
          description="It may belong to another festival, or it was removed."
        />
      </GaneshScreen>
    );
  }

  const badge = householdBadge(household.status);
  const pct =
    household.expectedAmount > 0
      ? Math.min(100, Math.round((household.collectedAmount / household.expectedAmount) * 100))
      : 0;
  const trackColor =
    household.status === "paid"
      ? g.godFund
      : household.status === "partial"
        ? theme.colors.warning
        : g.divider;
  const remaining = Math.max(0, household.expectedAmount - household.collectedAmount);

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title={household.name}
        subtitle={household.houseNumber ? `House ${household.houseNumber}` : undefined}
        icon={<HomeIcon size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
        rightElement={<StatusBadge kind={badge.kind} label={badge.label} />}
      />

      <FundHero
        eyebrow="Collected"
        amount={household.collectedAmount}
        kind="god"
        breakdown={
          household.expectedAmount > 0
            ? [
                { label: "Target", value: household.expectedAmount },
                { label: "Remaining", value: remaining },
              ]
            : undefined
        }
        footer={
          household.expectedAmount > 0 ? (
            <ProgressTrack pct={pct} color={trackColor} />
          ) : null
        }
      />

      {canUpdate ? (
        <Section title="Status" subtitle="Set what happened at this house">
          <View style={styles.form}>
            <FilterChips
              value={household.status}
              options={STATUS_OPTIONS}
              onChange={(next) => {
                void writes.updateHousehold(household.id, { status: next });
              }}
            />

            {editing ? (
              <>
                <Input
                  label="Target amount"
                  value={expected}
                  onChangeText={setExpected}
                  keyboardType="numeric"
                />
                <Button
                  onPress={() => {
                    void writes
                      .updateHousehold(household.id, { expectedAmount: Number(expected) })
                      .then(() => setEditing(false));
                  }}
                >
                  Save target
                </Button>
                <Button variant="ghost" onPress={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="outline" onPress={() => setEditing(true)}>
                Change target
              </Button>
            )}
          </View>
        </Section>
      ) : null}

      <Section
        title="Collection history"
        subtitle={`${history.length} ${history.length === 1 ? "entry" : "entries"}`}
      >
        {history.length === 0 ? (
          <EmptyState
            compact
            illustration="collect"
            title="Nothing collected yet"
            description="Chanda recorded for this house will appear here."
          />
        ) : (
          <View style={styles.list}>
            {history.map((row) => (
              <LedgerRow
                key={row.id}
                id={row.id}
                icon={
                  row.paymentMethod === "upi" ? (
                    <Smartphone size={18} color={g.godFund} strokeWidth={2.2} />
                  ) : (
                    <IndianRupee size={18} color={g.godFund} strokeWidth={2.2} />
                  )
                }
                iconTint={g.wash(g.godFund)}
                title={row.donorName}
                meta={METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod}
                amount={row.amount}
                attribution={accountabilityText({
                  collectedBy: memberDisplayName(members, row.collectorId),
                  enteredBy: memberDisplayName(members, row.createdBy),
                })}
                when={formatGaneshWhen(row.createdAt, row.date)}
                pending={row.pendingWrite}
              />
            ))}
          </View>
        )}

        {canVoid && history.length > 0 ? (
          <View style={styles.voidBlock}>
            {history.map((row) => (
              <Button
                key={`void-${row.id}`}
                size="sm"
                variant="outline"
                onPress={() => {
                  Alert.alert(
                    "Void this collection?",
                    `${formatInr(row.amount)} from ${row.donorName} will be reversed. The record stays in history.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Void",
                        style: "destructive",
                        onPress: () => {
                          void writes.voidFinancialRecord({
                            entityType: "collection",
                            entityId: row.id,
                            reason: "Voided from household history",
                          });
                        },
                      },
                    ]
                  );
                }}
              >
                {`Void ${formatInr(row.amount)} · ${row.donorName}`}
              </Button>
            ))}
          </View>
        ) : null}
      </Section>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
  list: {
    gap: 10,
  },
  voidBlock: {
    gap: 8,
    marginTop: 12,
  },
});
