import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { ArrowDownLeft, ArrowUpRight, Landmark, WifiOff } from "lucide-react-native";

import { FundLocationChips, fundLocationLabel } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import {
  FilterChips,
  GaneshEmptyState,
  GaneshHeader,
  LedgerRow,
  MetaLabel,
  Money,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
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
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type {
  PermanentFundLocation,
  PermanentFundTransaction,
  PermanentFundTxType,
} from "@/shared/types/ganesh";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { festivalCashSpent, festivalCollectedCash } from "@/shared/utils/ganeshMath";
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

type ActionMode = "hidden" | "donate" | "adjust" | "toFestival" | "fromFestival" | "initial";

export default function PermanentFundScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const listPadding = useGaneshListPadding(false);
  const { isOnline } = useNetwork();

  const { pandalId, festivalId } = useGaneshSession();
  const { fund } = usePermanentFund(pandalId);
  const { transactions, loading } = usePermanentFundTransactions(pandalId);
  const { festivals } = useFestivals(pandalId);
  const { summaries } = useFestivalSummaries(
    pandalId,
    festivals.map((festival) => festival.id)
  );
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const canAdd = can("permanentFund.add");
  const canTransfer = can("permanentFund.transfer");
  const openFestivals = festivals.filter((festival) => festival.status === "open");

  const renderItem = useCallback(
    ({ item }: { item: PermanentFundTransaction }) => (
      <FundTransactionRow item={item} enteredBy={memberDisplayName(members, item.createdBy)} />
    ),
    [members]
  );

  return (
    <GaneshScreen safeTop scroll={false}>
      <GaneshHeader
        title="Permanent Fund"
        subtitle="Carries across festivals"
        icon={<Landmark size={22} color={g.maroon} strokeWidth={2.2} />}
        onBack={back}
      />

      <FlashList
        data={transactions}
        style={styles.list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: listPadding }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PermanentFundCard
              fund={fund}
              variant="hero"
              onAddPress={
                canAdd && fund.total === 0
                  ? () => push("/(ganesh)/add-permanent-fund" as never)
                  : undefined
              }
            />

            {!isOnline ? (
              <StatusStrip
                tone="muted"
                icon={<WifiOff size={14} color={theme.colors.mutedForeground} strokeWidth={2.3} />}
                message="Transfers need a connection. Viewing history still works offline."
              />
            ) : null}

            {canAdd || canTransfer ? (
              <FundActions
                fundAvailable={fund.total}
                openFestivalId={openFestivals[0]?.id ?? festivalId}
                openFestivalName={
                  openFestivals[0]?.name
                  ?? festivals.find((festival) => festival.id === festivalId)?.name
                }
                showInitial={canAdd && fund.total === 0}
                canAdd={canAdd}
                canTransfer={canTransfer}
                onDonate={(input) => writes.addPermanentFundDonation(input)}
                onAdjust={(input) => writes.adjustPermanentFund(input)}
                onSeed={(input) => writes.seedPermanentFund(input)}
                onTransferOut={(input) => writes.transferPermanentToFestival(input)}
                onTransferIn={(input) => writes.transferFestivalToPermanent(input)}
              />
            ) : (
              <StatusStrip
                tone="muted"
                message="Members can view this fund. Adding or transferring money needs a role that allows it."
              />
            )}

            <Section title="Festival history" subtitle="What each festival took and returned">
              {festivals.length === 0 ? (
                <GaneshEmptyState
                  compact
                  icon={<Landmark size={20} color={g.saffron} strokeWidth={2.2} />}
                  title="No festivals yet"
                  description="The Permanent Fund stays with the Pandal even without an active festival."
                />
              ) : (
                festivals.map((festival, index) => {
                  const summary = summaries[festival.id];
                  return (
                    <View
                      key={festival.id}
                      style={[
                        styles.festivalRow,
                        index < festivals.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: g.divider,
                        },
                      ]}
                    >
                      <View style={styles.festivalTop}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.festivalName,
                            {
                              color: theme.colors.foreground,
                              fontFamily: theme.fontFamily.medium,
                            },
                          ]}
                        >
                          {festival.name}
                        </Text>
                        {festival.status === "open" ? (
                          <MetaLabel>Open</MetaLabel>
                        ) : (
                          <MetaLabel>Closed</MetaLabel>
                        )}
                      </View>

                      <View style={styles.festivalGrid}>
                        <View style={styles.festivalCell}>
                          <MetaLabel>Collected</MetaLabel>
                          <Money
                            value={summary ? festivalCollectedCash(summary) : 0}
                            size="secondary"
                          />
                        </View>
                        <View style={styles.festivalCell}>
                          <MetaLabel>Spent</MetaLabel>
                          <Money value={summary ? festivalCashSpent(summary) : 0} size="secondary" />
                        </View>
                        <View style={styles.festivalCell}>
                          <MetaLabel>Took</MetaLabel>
                          <Money
                            value={summary?.receivedFromPermanentFund ?? 0}
                            size="secondary"
                          />
                        </View>
                        <View style={styles.festivalCell}>
                          <MetaLabel>Returned</MetaLabel>
                          <Money
                            value={summary?.transferredToPermanentFund ?? 0}
                            size="secondary"
                          />
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </Section>

            <Text
              style={[
                styles.historyHeading,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              History
            </Text>
          </View>
        }
        renderItem={renderItem}
        ListEmptyComponent={
          loading && transactions.length === 0 ? null : (
            <GaneshEmptyState
              icon={<Landmark size={22} color={g.saffron} strokeWidth={2.2} />}
              title="No Permanent Fund movements yet"
              description="Initial balances, festival transfers, and Pandal donations will appear here."
            />
          )
        }
      />
    </GaneshScreen>
  );
}

function FundTransactionRow({
  item,
  enteredBy,
}: {
  item: PermanentFundTransaction;
  enteredBy: string;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const inbound = item.signedAmount >= 0;

  const counterpart =
    item.festivalName
    || (item.destinationType === "FESTIVAL"
      ? "Festival"
      : item.sourceType === "FESTIVAL"
        ? "Festival"
        : item.type === "DONATION"
          ? "Pandal donation"
          : item.type === "INITIAL_BALANCE"
            ? "Existing Pandal fund"
            : "External");

  return (
    <LedgerRow
      id={item.id}
      icon={
        inbound ? (
          <ArrowDownLeft size={18} color={g.godFund} strokeWidth={2.4} />
        ) : (
          <ArrowUpRight size={18} color={g.maroon} strokeWidth={2.4} />
        )
      }
      iconTint={g.wash(inbound ? g.godFund : g.maroon)}
      title={TX_LABELS[item.type]}
      meta={[counterpart, fundLocationLabel(item.location), item.description || null]
        .filter(Boolean)
        .join(" · ")}
      amount={item.amount}
      amountMeta={<MetaLabel>{inbound ? "In" : "Out"}</MetaLabel>}
      attribution={`${inbound ? "Added by" : "Approved by"} ${enteredBy}`}
      when={formatGaneshWhen(item.createdAt, item.date)}
      pending={item.pendingWrite}
    />
  );
}

function FundActions({
  fundAvailable,
  openFestivalId,
  openFestivalName,
  showInitial,
  canAdd,
  canTransfer,
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
  canAdd?: boolean;
  canTransfer?: boolean;
  onDonate: (input: {
    amount: number;
    location: PermanentFundLocation;
    description?: string;
  }) => Promise<unknown>;
  onAdjust: (input: {
    amount: number;
    location: PermanentFundLocation;
    reason: string;
  }) => Promise<unknown>;
  onSeed: (input: {
    amount?: number;
    location?: PermanentFundLocation;
    description?: string;
  }) => Promise<unknown>;
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
  const [mode, setMode] = useState<ActionMode>("hidden");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<PermanentFundLocation>("cash");
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);
  const [busy, setBusy] = useState(false);

  const parsedAmount = Number(amount);

  const modes = useMemo(
    () => [
      { id: "hidden" as const, label: "None" },
      ...(canAdd && showInitial
        ? [{ id: "initial" as const, label: "Record existing balance" }]
        : []),
      ...(canAdd ? [{ id: "donate" as const, label: "Add donation" }] : []),
      ...(canTransfer
        ? [
            { id: "toFestival" as const, label: "Use for festival" },
            { id: "fromFestival" as const, label: "Return from festival" },
            { id: "adjust" as const, label: "Adjust" },
          ]
        : []),
    ],
    [canAdd, canTransfer, showInitial]
  );

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

  return (
    <Section title="Move money" subtitle="Every movement is recorded in the history below">
      <View style={styles.actionBlock}>
        <FilterChips value={mode} options={modes} onChange={setMode} />

        {mode !== "hidden" ? (
          <View style={styles.actionForm}>
            {mode === "toFestival" ? (
              <StatusStrip
                tone="info"
                message={`Available ${formatInr(fundAvailable)}. This is a fund transfer, not a donation.${
                  openFestivalName
                    ? ` Destination: ${openFestivalName}.`
                    : " Open a festival first."
                }`}
              />
            ) : null}

            {mode === "fromFestival" ? (
              <StatusStrip
                tone="info"
                message="Unused festival cash returns to the Permanent Fund. This is not new income."
              />
            ) : null}

            {mode === "adjust" ? (
              <FilterChips
                label="Direction"
                value={adjustSign === 1 ? "add" : "subtract"}
                options={[
                  { id: "add", label: "Add" },
                  { id: "subtract", label: "Subtract" },
                ]}
                onChange={(next) => setAdjustSign(next === "add" ? 1 : -1)}
              />
            ) : null}

            <Input
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
            />

            <FilterChips
              label="Money location"
              value={location}
              options={[
                { id: "cash" as PermanentFundLocation, label: "Cash" },
                { id: "upi" as PermanentFundLocation, label: "UPI" },
                { id: "bank" as PermanentFundLocation, label: "Bank" },
                { id: "other" as PermanentFundLocation, label: "Other" },
              ]}
              onChange={setLocation}
            />

            <Input
              label={mode === "adjust" ? "Reason" : "Description (optional)"}
              value={description}
              onChangeText={setDescription}
            />

            <Button
              loading={busy}
              disabled={
                !Number.isFinite(parsedAmount)
                || parsedAmount <= 0
                || (mode === "toFestival" && !openFestivalId)
                || (mode === "adjust" && !description.trim())
              }
              onPress={submit}
            >
              Save
            </Button>
          </View>
        ) : null}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  header: {
    gap: 16,
    paddingBottom: 12,
  },
  separator: {
    height: 10,
  },
  historyHeading: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  festivalRow: {
    paddingVertical: 12,
    gap: 8,
  },
  festivalTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  festivalName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  festivalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  festivalCell: {
    minWidth: 68,
    gap: 1,
  },
  actionBlock: {
    gap: 12,
  },
  actionForm: {
    gap: 12,
  },
});
