import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Building2, ChevronRight, Package, Receipt } from "lucide-react-native";

import { accountabilityText } from "@/components/ganesh/AccountabilityLine";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import {
  FundHero,
  GaneshHeader,
  MetaLabel,
  Money,
  Section,
  StatTile,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshExpense } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { useSponsorships } from "@/hooks/useSponsorships";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import { isAssetPurchaseExpense } from "@/shared/utils/ganeshAssets";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function ExpenseDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const params = useLocalSearchParams<{ id: string; festivalId?: string }>();
  const { pandalId, festivalId: sessionFestivalId } = useGaneshSession();

  const expenseFestivalId =
    typeof params.festivalId === "string" && params.festivalId
      ? params.festivalId
      : sessionFestivalId;

  const { festivals } = useFestivals(pandalId);
  const { expense, loading } = useGaneshExpense(pandalId, expenseFestivalId, params.id ?? null);
  const { assets } = usePandalAssets(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const { sponsorships } = useSponsorships(pandalId, expenseFestivalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const [total, setTotal] = useState("");
  const [godFund, setGodFund] = useState("");
  const [personal, setPersonal] = useState("");
  const [sponsored, setSponsored] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const festival = festivals.find((item) => item.id === expenseFestivalId);
  const linkedAsset = assets.find((item) => item.id === expense?.assetId);
  const linkedSponsorship = sponsorships.find((item) => item.id === expense?.linkedSponsorshipId);
  const linkedSponsor = sponsors.find((item) => item.id === linkedSponsorship?.sponsorId);
  const receiptPath = ganeshStoredPath(expense?.receipt, expense?.receiptPath);
  const isPurchase = isAssetPurchaseExpense(expense);

  const canEdit =
    can("expenses.update") && festival?.status === "open" && expense && !expense.voided;
  const canVoid = can("expenses.void") && expense && !expense.voided;

  useEffect(() => {
    if (!expense) return;
    setTotal(String(expense.totalAmount ?? ""));
    setGodFund(String(expense.godFundAmount ?? ""));
    setPersonal(String(expense.personalAmount ?? ""));
    setSponsored(String(expense.sponsoredAmount ?? ""));
  }, [expense?.id, expense?.updatedAt?.seconds]);

  if (loading && !expense) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Expense"
          icon={<Receipt size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <SkeletonList count={4} />
      </GaneshScreen>
    );
  }

  if (!expense) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Expense"
          icon={<Receipt size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <EmptyState
          illustration="search"
          title="Expense not found"
          description="It may belong to another festival, or it was removed."
        />
      </GaneshScreen>
    );
  }

  const confirmVoid = () => {
    const assetName = linkedAsset?.name ?? "linked item";
    const message = isPurchase
      ? `This expense created an asset (${assetName}). Voiding does not delete the asset.`
      : "This reverses the cash on the festival. The record stays in history.";
    Alert.alert("Void this expense?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Void",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          writes
            .voidFinancialRecord(
              {
                entityType: "expense",
                entityId: expense.id,
                reason: isPurchase
                  ? "Voided asset purchase. Asset kept."
                  : "Voided from expense detail",
              },
              { festivalId: expenseFestivalId ?? undefined }
            )
            .catch((error) => {
              logError("ganesh.voidExpense", error);
              toast.error(friendlyErrorMessage(error, "Could not void."));
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const isSplit = expense.godFundAmount > 0 && expense.personalAmount > 0;
  const fundKind = expense.personalAmount > 0 && expense.godFundAmount === 0 ? "personal" : "god";

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title={expense.name}
        subtitle={[festival?.name, expense.categoryName].filter(Boolean).join(" · ") || undefined}
        icon={
          isPurchase ? (
            <Package size={22} color={g.saffron} strokeWidth={2.2} />
          ) : (
            <Receipt size={22} color={g.saffron} strokeWidth={2.2} />
          )
        }
        onBack={back}
        rightElement={
          expense.voided ? (
            <StatusBadge kind="cancelled" label="Voided" />
          ) : isPurchase ? (
            <StatusBadge kind="asset" label="Asset purchase" />
          ) : null
        }
      />

      <FundHero
        eyebrow="Total spent"
        amount={expense.totalAmount}
        kind={fundKind}
        breakdown={
          isSplit || expense.sponsoredAmount > 0
            ? [
                { label: "God Fund", value: expense.godFundAmount },
                { label: "Personal", value: expense.personalAmount },
                ...(expense.sponsoredAmount > 0
                  ? [{ label: "Sponsored", value: expense.sponsoredAmount }]
                  : []),
              ]
            : undefined
        }
        footer={
          <Text
            style={[
              styles.attribution,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
            ]}
          >
            {accountabilityText({
              paidBy: memberDisplayName(members, expense.paidByMemberId),
              enteredBy: memberDisplayName(members, expense.createdBy),
            })}
            {formatGaneshWhen(expense.createdAt, expense.date)
              ? `\n${formatGaneshWhen(expense.createdAt, expense.date)}`
              : ""}
          </Text>
        }
      />

      <PendingHint pending={expense.pendingWrite} />

      {expense.voided ? (
        <StatusStrip
          tone="muted"
          message={`Voided${expense.voidReason ? ` · ${expense.voidReason}` : ""}. The cash was reversed; the record stays in history.`}
        />
      ) : null}

      {expense.personalAmount > 0 && !expense.voided ? (
        <Section title="Personal money" subtitle="Fronted by a member, owed back from the God Fund">
          <View style={styles.statRow}>
            <StatTile label="Paid personally">
              <Money
                value={expense.personalAmount}
                size="primary"
                numberOfLines={1}
                adjustsFontSizeToFit
              />
            </StatTile>
            <StatTile label="Paid by">
              <Text
                numberOfLines={1}
                style={[
                  styles.textValue,
                  { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                ]}
              >
                {memberDisplayName(members, expense.paidByMemberId)}
              </Text>
            </StatTile>
          </View>
          <StatusStrip
            tone="info"
            message="Reimburse from the member's page when the Pandal pays them back."
          />
        </Section>
      ) : null}

      {expense.vendor || expense.notes ? (
        <Section title="Details">
          <View style={styles.factList}>
            {expense.vendor ? <Fact label="Vendor" value={expense.vendor} /> : null}
            {expense.notes ? <Fact label="Notes" value={expense.notes} /> : null}
          </View>
        </Section>
      ) : null}

      {linkedSponsorship || linkedAsset || (expense.sponsoredAmount > 0 && linkedSponsor) ? (
        <Section title="Linked records">
          {linkedSponsorship || (expense.sponsoredAmount > 0 && linkedSponsor) ? (
            <LinkRow
              icon={<Building2 size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
              title={linkedSponsor?.name ?? "Linked sponsor"}
              meta={
                expense.sponsoredAmount > 0
                  ? `Sponsored ${formatInr(expense.sponsoredAmount)}`
                  : "Sponsor"
              }
              divider={Boolean(linkedAsset)}
              onPress={() =>
                push(
                  `/(ganesh)/sponsor/${linkedSponsorship?.sponsorId ?? linkedSponsor?.id}` as never
                )
              }
            />
          ) : null}
          {linkedAsset ? (
            <LinkRow
              icon={<Package size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
              title={linkedAsset.name}
              meta="Pandal asset created by this purchase"
              onPress={() => push(`/(ganesh)/asset/${linkedAsset.id}` as never)}
            />
          ) : null}
        </Section>
      ) : isPurchase ? (
        <StatusStrip
          tone="muted"
          message="This purchase created an asset that is still in the Pandal inventory."
        />
      ) : null}

      {pandalId && expenseFestivalId && receiptPath ? (
        <Section title="Receipt" plain>
          <GaneshSignedPreview
            path={receiptPath}
            pandalId={pandalId}
            festivalId={expenseFestivalId}
          />
        </Section>
      ) : null}

      {canEdit ? (
        editing ? (
          <Section
            title="Correct the amount"
            subtitle={
              isPurchase
                ? "This updates the amount paid on the asset. The estimated value stays the same."
                : "Use this only to fix a mistake — the correction is recorded in the audit log."
            }
          >
            <View style={styles.form}>
              <Input label="Total" value={total} onChangeText={setTotal} keyboardType="numeric" />
              <Input
                label="God Fund"
                value={godFund}
                onChangeText={setGodFund}
                keyboardType="numeric"
              />
              <Input
                label="Personal"
                value={personal}
                onChangeText={setPersonal}
                keyboardType="numeric"
              />
              <Input
                label="Sponsored"
                value={sponsored}
                onChangeText={setSponsored}
                keyboardType="numeric"
              />
              <Button
                loading={busy}
                onPress={() => {
                  setBusy(true);
                  writes
                    .updateExpenseAmounts(
                      expense.id,
                      {
                        totalAmount: Number(total),
                        godFundAmount: Number(godFund),
                        personalAmount: Number(personal),
                        sponsoredAmount: Number(sponsored || 0),
                      },
                      { festivalId: expenseFestivalId ?? undefined }
                    )
                    .then(() => setEditing(false))
                    .catch((error) => {
                      logError("ganesh.updateExpense", error);
                      toast.error(friendlyErrorMessage(error, "Could not update amount."));
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Save amount
              </Button>
              <Button variant="ghost" onPress={() => setEditing(false)}>
                Cancel
              </Button>
            </View>
          </Section>
        ) : (
          <Button variant="outline" onPress={() => setEditing(true)}>
            Correct the amount
          </Button>
        )
      ) : null}

      {canVoid ? (
        <Button variant="outline" loading={busy} onPress={confirmVoid}>
          Void expense
        </Button>
      ) : null}
    </GaneshScreen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.fact}>
      <MetaLabel>{label}</MetaLabel>
      <Text
        style={[
          styles.factValue,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function LinkRow({
  icon,
  title,
  meta,
  divider,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  divider?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      android_ripple={{
        color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
        borderless: false,
      }}
      style={({ pressed }) => [
        styles.linkRow,
        divider && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: g.divider,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.linkGlyph, { backgroundColor: g.tile }]}>{icon}</View>
      <View style={styles.linkCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.linkTitle,
            { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
          ]}
        >
          {title}
        </Text>
        <MetaLabel>{meta}</MetaLabel>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  attribution: {
    fontSize: 12,
    lineHeight: 17,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  textValue: {
    fontSize: 15,
    letterSpacing: -0.1,
  },
  factList: {
    gap: 12,
  },
  fact: {
    gap: 1,
  },
  factValue: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  form: {
    gap: 12,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
  },
  linkGlyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  linkCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  linkTitle: {
    fontSize: 14.5,
  },
});
