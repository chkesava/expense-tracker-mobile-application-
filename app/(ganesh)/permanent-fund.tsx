import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { EmptyState } from "@/components/common/EmptyState";
import { FundLocationChips, fundLocationLabel } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivalSummaries } from "@/hooks/useFestivalSummaries";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { usePermanentFundTransactions } from "@/hooks/usePermanentFundTransactions";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { PermanentFundLocation, PermanentFundTransaction, PermanentFundTxType } from "@/shared/types/ganesh";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import {
  canManagePandal,
  festivalCashSpent,
  festivalCollectedCash,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

const TX_LABELS: Record<PermanentFundTxType, string> = {
  INITIAL_BALANCE: "Initial balance",
  CARRY_FORWARD: "Carry forward",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  DONATION: "Pandal donation",
  ADJUSTMENT: "Adjustment",
};

export default function PermanentFundScreen() {
  const { theme } = useTheme();
  const { realUser } = useAuth();
  const { isOnline } = useNetwork();
  const { pandalId, festivalId } = useGaneshSession();
  const { fund } = usePermanentFund(pandalId);
  const { transactions } = usePermanentFundTransactions(pandalId);
  const { festivals } = useFestivals(pandalId);
  const { summaries } = useFestivalSummaries(
    pandalId,
    festivals.map((festival) => festival.id)
  );
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const me = members.find((member) => member.userId === realUser?.uid);
  const manager = canManagePandal(me?.role);
  const openFestivals = festivals.filter((festival) => festival.status === "open");

  return (
    <GaneshScreen scroll={false}>
      <FlashList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 8 }}>
            <PermanentFundCard fund={fund} />
            {!isOnline ? (
              <Text style={{ color: theme.colors.mutedForeground }}>
                Transfers need an active connection. Viewing history still works offline.
              </Text>
            ) : null}
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              Festival history
            </Text>
            {festivals.length === 0 ? (
              <EmptyState
                title="No festivals yet"
                description="The Permanent Fund stays with the Pandal even without an active festival."
              />
            ) : (
              festivals.map((festival) => {
                const summary = summaries[festival.id];
                return (
                  <View
                    key={festival.id}
                    style={{
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      borderRadius: 16,
                      padding: 14,
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                      {festival.name}
                    </Text>
                    <Text style={{ color: theme.colors.mutedForeground }}>
                      Collected {formatInr(summary ? festivalCollectedCash(summary) : 0)}
                      {" · "}
                      Spent {formatInr(summary ? festivalCashSpent(summary) : 0)}
                    </Text>
                    <Text style={{ color: theme.colors.mutedForeground }}>
                      From Permanent Fund{" "}
                      {formatInr(summary?.receivedFromPermanentFund ?? 0)}
                      {" · "}
                      Returned {formatInr(summary?.transferredToPermanentFund ?? 0)}
                    </Text>
                  </View>
                );
              })
            )}
            {manager ? (
              <ManagerFundActions
                fundAvailable={fund.total}
                openFestivalId={openFestivals[0]?.id ?? festivalId}
                openFestivalName={
                  openFestivals[0]?.name ??
                  festivals.find((festival) => festival.id === festivalId)?.name
                }
                showInitial={fund.total === 0}
                onDonate={(input) => writes.addPermanentFundDonation(input)}
                onAdjust={(input) => writes.adjustPermanentFund(input)}
                onSeed={(input) => writes.seedPermanentFund(input)}
                onTransferOut={(input) => writes.transferPermanentToFestival(input)}
                onTransferIn={(input) => writes.transferFestivalToPermanent(input)}
              />
            ) : (
              <Text style={{ color: theme.colors.mutedForeground }}>
                Members can view this fund. Only an admin or treasurer can transfer money.
              </Text>
            )}
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>History</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TransactionRow
            item={item}
            enteredBy={memberDisplayName(members, item.createdBy)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No Permanent Fund movements yet"
            description="Initial balances, festival transfers, and pandal donations will appear here."
          />
        }
      />
    </GaneshScreen>
  );
}

function TransactionRow({
  item,
  enteredBy,
}: {
  item: PermanentFundTransaction;
  enteredBy: string;
}) {
  const { theme } = useTheme();
  const inbound = item.signedAmount >= 0;
  const counterpart =
    item.festivalName ||
    (item.destinationType === "FESTIVAL"
      ? "Festival"
      : item.sourceType === "FESTIVAL"
        ? "Festival"
        : item.type === "DONATION"
          ? "Pandal donation"
          : item.type === "INITIAL_BALANCE"
            ? "Existing Pandal fund"
            : "External");
  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        gap: 4,
      }}
    >
      <Text style={{ color: inbound ? theme.colors.primary : theme.colors.foreground, fontWeight: "800" }}>
        {inbound ? "+" : "-"} {formatInr(item.amount)}
      </Text>
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
        {TX_LABELS[item.type]}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {counterpart} · {fundLocationLabel(item.location)}
      </Text>
      {item.description ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{item.description}</Text>
      ) : null}
      <Text style={{ color: theme.colors.mutedForeground }}>
        {inbound ? "Added by" : "Approved by"} {enteredBy}
        {formatGaneshWhen(item.createdAt, item.date) ? ` · ${formatGaneshWhen(item.createdAt, item.date)}` : ""}
      </Text>
      <PendingHint pending={item.pendingWrite} />
    </View>
  );
}

function ManagerFundActions({
  fundAvailable,
  openFestivalId,
  openFestivalName,
  showInitial,
  onDonate,
  onAdjust,
  onSeed,
  onTransferOut,
  onTransferIn,
}: {
  fundAvailable: number;
  openFestivalId?: string | null;
  openFestivalName?: string;
  showInitial?: boolean;
  onDonate: (input: { amount: number; location: PermanentFundLocation; description?: string }) => Promise<unknown>;
  onAdjust: (input: { amount: number; location: PermanentFundLocation; reason: string }) => Promise<unknown>;
  onSeed: (input: { amount?: number; location?: PermanentFundLocation; description?: string }) => Promise<unknown>;
  onTransferOut: (input: {
    festivalId?: string;
    amount: number;
    location: PermanentFundLocation;
    festivalName?: string;
    description?: string;
  }) => Promise<unknown>;
  onTransferIn: (input: {
    amount: number;
    location: PermanentFundLocation;
    festivalName?: string;
    description?: string;
    type?: "CARRY_FORWARD" | "TRANSFER_IN";
  }) => Promise<unknown>;
}) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<
    "hidden" | "donate" | "adjust" | "toFestival" | "fromFestival" | "initial"
  >("hidden");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<PermanentFundLocation>("cash");
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);
  const [busy, setBusy] = useState(false);
  const parsedAmount = Number(amount);

  const submit = () => {
    setBusy(true);
    const work =
      mode === "initial"
        ? onSeed({ amount: parsedAmount, location, description })
        : mode === "donate"
        ? onDonate({ amount: parsedAmount, location, description })
        : mode === "adjust"
          ? onAdjust({
              amount: parsedAmount * adjustSign,
              location,
              reason: description,
            })
          : mode === "toFestival"
            ? onTransferOut({
                festivalId: openFestivalId ?? undefined,
                amount: parsedAmount,
                location,
                festivalName: openFestivalName,
                description,
              })
            : onTransferIn({
                amount: parsedAmount,
                location,
                festivalName: openFestivalName,
                description,
                type: "TRANSFER_IN",
              });
    work
      .then(() => {
        setAmount("");
        setDescription("");
        setMode("hidden");
      })
      .catch((error) => {
        logError("ganesh.permanentFund.action", error);
        toast.error(friendlyErrorMessage(error, "Could not update the Permanent Fund."));
      })
      .finally(() => setBusy(false));
  };

  const modes = useMemo(
    () =>
      [
        ...(showInitial ? [{ id: "initial" as const, label: "Record existing balance" }] : []),
        { id: "donate" as const, label: "Add donation" },
        { id: "adjust" as const, label: "Adjust" },
        { id: "toFestival" as const, label: "Use for festival" },
        { id: "fromFestival" as const, label: "Return from festival" },
      ],
    [showInitial]
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {modes.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setMode((prev) => (prev === item.id ? "hidden" : item.id))}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: mode === item.id ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: mode === item.id ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode !== "hidden" ? (
        <View style={{ gap: 10 }}>
          {mode === "toFestival" ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              Available Permanent Fund {formatInr(fundAvailable)}. This is a fund transfer, not a
              donation.
              {openFestivalName ? ` Destination: ${openFestivalName}.` : " Open a festival first."}
            </Text>
          ) : null}
          {mode === "fromFestival" ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              Unused festival cash returns to the Permanent Fund. This is not new income.
            </Text>
          ) : null}
          {mode === "adjust" ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setAdjustSign(1)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: adjustSign === 1 ? theme.colors.primary : theme.colors.muted,
                }}
              >
                <Text
                  style={{
                    color: adjustSign === 1 ? theme.colors.primaryForeground : theme.colors.foreground,
                    fontWeight: "700",
                  }}
                >
                  Add
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAdjustSign(-1)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: adjustSign === -1 ? theme.colors.primary : theme.colors.muted,
                }}
              >
                <Text
                  style={{
                    color: adjustSign === -1 ? theme.colors.primaryForeground : theme.colors.foreground,
                    fontWeight: "700",
                  }}
                >
                  Subtract
                </Text>
              </Pressable>
            </View>
          ) : null}
          <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Money location</Text>
          <FundLocationChips value={location} onChange={setLocation} />
          <Input
            label={mode === "adjust" ? "Reason" : "Description (optional)"}
            value={description}
            onChangeText={setDescription}
          />
          <Button
            loading={busy}
            disabled={mode === "toFestival" && !openFestivalId}
            onPress={submit}
          >
            Save
          </Button>
        </View>
      ) : null}
    </View>
  );
}
