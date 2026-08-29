import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Package, Receipt } from "lucide-react-native";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { FilterChips, GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshCategories } from "@/hooks/useGaneshCategories";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { useSponsorships } from "@/hooks/useSponsorships";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type { GaneshExpenseType } from "@/shared/types/ganesh";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_UNITS,
} from "@/shared/utils/ganeshAssets";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { purposeLabelOf } from "@/shared/utils/ganeshSponsors";
import { useTheme } from "@/theme/ThemeProvider";

type Funding = "god" | "personal" | "split" | "sponsored";

export default function AddExpenseScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { realUser } = useAuth();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { categories } = useGaneshCategories(pandalId, festivalId);
  const visibleCategories = categories.filter((category) => !category.disabled);
  const { members } = usePandalMembers(pandalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const canLinkSponsor = can("sponsors.receive");
  const openExpenseDeals = sponsorships.filter(
    (row) =>
      row.sponsoringType === "expense" &&
      (row.status === "promised" || row.status === "confirmed")
  );
  const { isOnline, uploadExpenseReceipt } = useGaneshStorage();
  const canBuyAsset = can("assets.create");
  const [kind, setKind] = useState<GaneshExpenseType>("normal");
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [godFund, setGodFund] = useState("");
  const [personal, setPersonal] = useState("");
  const [sponsored, setSponsored] = useState("");
  const [sponsorId, setSponsorId] = useState("");
  const [linkedSponsorshipId, setLinkedSponsorshipId] = useState("");
  const [funding, setFunding] = useState<Funding>("god");
  const [categoryId, setCategoryId] = useState(visibleCategories[0]?.id ?? "");
  const [paidByMemberId, setPaidByMemberId] = useState(realUser?.uid ?? "");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCategory, setAssetCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("furniture");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetValue, setAssetValue] = useState("");
  const [assetCondition, setAssetCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [receipt, setReceipt] = useState<PreparedGaneshImage | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedCategory =
    visibleCategories.find((category) => category.id === categoryId) ?? visibleCategories[0];
  const closed = festivals.find((item) => item.id === festivalId)?.status === "closed";
  const ledgerSaved = Boolean(savedId);
  const isAssetPurchase = kind === "asset_purchase" && canBuyAsset;
  const fundingOptions: Array<{ id: Funding; label: string }> = [
    { id: "god", label: "God Fund" },
    { id: "personal", label: "Personal" },
    { id: "split", label: "Split" },
  ];
  if (canLinkSponsor) fundingOptions.push({ id: "sponsored", label: "Sponsored" });

  const resolvedFunding = () => {
    const totalAmount = Number(total);
    if (funding === "god") return { totalAmount, godFundAmount: totalAmount, personalAmount: 0, sponsoredAmount: 0 };
    if (funding === "personal") return { totalAmount, godFundAmount: 0, personalAmount: totalAmount, sponsoredAmount: 0 };
    if (funding === "sponsored") return { totalAmount, godFundAmount: 0, personalAmount: 0, sponsoredAmount: totalAmount };
    return {
      totalAmount,
      godFundAmount: Number(godFund),
      personalAmount: Number(personal),
      sponsoredAmount: Number(sponsored || 0),
    };
  };

  const persistReceipt = async (expenseId: string, file: PreparedGaneshImage) => {
    if (!isOnline) {
      setReceiptStatus("waiting");
      return false;
    }
    setReceiptStatus("uploading");
    try {
      await uploadExpenseReceipt(expenseId, file);
      setReceiptStatus("uploaded");
      return true;
    } catch (error) {
      logError("ganesh.receiptUpload", error);
      setReceiptStatus("failed");
      toast.error("Expense saved, but receipt upload failed.");
      return false;
    }
  };

  useEffect(() => {
    if (!isOnline || receiptStatus !== "waiting" || !savedId || !receipt) return;
    setBusy(true);
    void persistReceipt(savedId, receipt)
      .then((ok) => {
        if (ok) back();
      })
      .finally(() => setBusy(false));
  }, [isOnline, receiptStatus, savedId, receipt]);

  if (!can("expenses.create")) {
    return <GaneshWriteLock message="Your role cannot add expenses." />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title={isAssetPurchase ? "Add Pandal asset" : "Add expense"}
        onBack={back}
      />
      <View style={styles.kindRow}>
        <ExpenseKindCard
          selected={isAssetPurchase}
          disabled={ledgerSaved || !canBuyAsset}
          icon={<Package size={18} color={isAssetPurchase ? g.saffron : theme.colors.mutedForeground} strokeWidth={2.2} />}
          title="Pandal Asset"
          description="Something the Pandal keeps and reuses"
          onPress={() => setKind("asset_purchase")}
        />
        <ExpenseKindCard
          selected={!isAssetPurchase}
          disabled={ledgerSaved}
          icon={<Receipt size={18} color={!isAssetPurchase ? g.saffron : theme.colors.mutedForeground} strokeWidth={2.2} />}
          title="Festival Expense"
          description="Something used up for this festival"
          onPress={() => setKind("normal")}
        />
      </View>
      {!canBuyAsset ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Adding a Pandal Asset needs permission to add Pandal assets.
        </Text>
      ) : null}
      {isAssetPurchase ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          This records the spend and adds the item to Pandal assets. Money stays on the festival;
          ownership stays with the Pandal.
        </Text>
      ) : null}
      <Input label="Expense name" value={name} onChangeText={setName} placeholder="Flowers" editable={!ledgerSaved} />
      <Input label="Amount" value={total} onChangeText={setTotal} keyboardType="numeric" editable={!ledgerSaved} />
      <FilterChips
        label="Funding"
        layout="wrap"
        value={funding}
        options={fundingOptions}
        onChange={setFunding}
        disabled={ledgerSaved}
      />
      {funding === "split" ? (
        <>
          <Input label="God Fund amount" value={godFund} onChangeText={setGodFund} keyboardType="numeric" editable={!ledgerSaved} />
          <Input label="Personal amount" value={personal} onChangeText={setPersonal} keyboardType="numeric" editable={!ledgerSaved} />
          {canLinkSponsor ? (
            <Input
              label="Sponsored amount"
              value={sponsored}
              onChangeText={setSponsored}
              keyboardType="numeric"
              editable={!ledgerSaved}
            />
          ) : null}
        </>
      ) : null}
      {!canLinkSponsor ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Linking a sponsored amount needs permission to mark a sponsorship received.
        </Text>
      ) : null}
      {canLinkSponsor && (funding === "sponsored" || (funding === "split" && Number(sponsored || 0) > 0)) ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Sponsored amount is not income. Pick a sponsor, or an open expense-type deal.
          </Text>
          {openExpenseDeals.length > 0 ? (
            <FilterChips
              label="Open expense sponsorship"
              layout="wrap"
              value={linkedSponsorshipId || "new"}
              options={[
                { id: "new", label: "New deal" },
                ...openExpenseDeals.map((deal) => ({
                  id: deal.id,
                  label: `${sponsors.find((item) => item.id === deal.sponsorId)?.name ?? "Sponsor"} · ${purposeLabelOf(deal.purpose, deal.purposeLabel)} · ${formatInr(deal.amount)}`,
                })),
              ]}
              onChange={(next) => {
                if (next === "new") {
                  setLinkedSponsorshipId("");
                  return;
                }
                const deal = openExpenseDeals.find((item) => item.id === next);
                setLinkedSponsorshipId(next);
                if (deal) setSponsorId(deal.sponsorId);
              }}
              disabled={ledgerSaved}
            />
          ) : null}
          {linkedSponsorshipId ? null : (
            <FilterChips
              label="Sponsor"
              layout="wrap"
              value={sponsorId}
              options={sponsors.map((item) => ({ id: item.id, label: item.name }))}
              onChange={setSponsorId}
              disabled={ledgerSaved}
            />
          )}
        </View>
      ) : null}
      <FilterChips
        label="Category"
        layout="wrap"
        value={categoryId || visibleCategories[0]?.id || ""}
        options={visibleCategories.map((category) => ({ id: category.id, label: category.name }))}
        onChange={setCategoryId}
        disabled={ledgerSaved}
      />
      {isAssetPurchase ? (
        <View style={{ gap: 16 }}>
          <Input
            label="Asset name"
            value={assetName}
            onChangeText={setAssetName}
            placeholder={name || "Plastic chairs"}
            editable={!ledgerSaved}
          />
          <Input
            label="Quantity"
            value={assetQty}
            onChangeText={setAssetQty}
            keyboardType="number-pad"
            editable={!ledgerSaved}
          />
          <ChoiceChips
            label="Asset category"
            value={assetCategory}
            options={ASSET_CATEGORIES}
            onChange={setAssetCategory}
            disabled={ledgerSaved}
          />
        </View>
      ) : null}
      <FormDetails>
      <FilterChips
        label="Paid by"
        layout="wrap"
        value={paidByMemberId}
        options={members.map((member) => ({ id: member.userId, label: member.displayName }))}
        onChange={setPaidByMemberId}
        disabled={ledgerSaved}
      />
      <Input label="Vendor (optional)" value={vendor} onChangeText={setVendor} editable={!ledgerSaved} />
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} editable={!ledgerSaved} />
      {isAssetPurchase ? (
        <View style={{ gap: 16 }}>
          <ChoiceChips
            label="Unit"
            value={assetUnit}
            options={ASSET_UNITS}
            onChange={setAssetUnit}
            disabled={ledgerSaved}
          />
          <Input
            label="Estimated value (optional)"
            value={assetValue}
            onChangeText={setAssetValue}
            keyboardType="numeric"
            editable={!ledgerSaved}
          />
          <ChoiceChips
            label="Condition"
            value={assetCondition}
            options={ASSET_CONDITIONS}
            onChange={setAssetCondition}
            disabled={ledgerSaved}
          />
          <Input
            label="Location (optional)"
            value={assetLocation}
            onChangeText={setAssetLocation}
            editable={!ledgerSaved}
          />
        </View>
      ) : null}
      <GaneshImageUploader
        title="Receipt"
        kind="receipt"
        status={receiptStatus}
        previewUri={receipt?.uri}
        disabled={busy}
        onPrepared={(file) => {
          setReceipt(file);
          setReceiptStatus("selected");
        }}
        onRemove={() => {
          setReceipt(null);
          setReceiptStatus("idle");
        }}
        onRetry={() => {
          if (!savedId || !receipt) return;
          setBusy(true);
          void persistReceipt(savedId, receipt)
            .then((ok) => {
              if (ok) back();
            })
            .finally(() => setBusy(false));
        }}
      />
      </FormDetails>
      <Button
        loading={busy}
        disabled={closed || ledgerSaved}
        onPress={() => {
          if (!selectedCategory) {
            toast.error("Add a category first.");
            return;
          }
          const fundingAmounts = resolvedFunding();
          if (fundingAmounts.sponsoredAmount > 0 && !sponsorId && !linkedSponsorshipId) {
            toast.error("Choose a sponsor for the sponsored amount.");
            return;
          }
          const payload = {
            name,
            ...fundingAmounts,
            categoryId: selectedCategory.id,
            categoryName: selectedCategory.name,
            paidByMemberId: paidByMemberId || realUser?.uid || "",
            vendor,
            notes,
            date: todayDateInput(),
            sponsorId: fundingAmounts.sponsoredAmount > 0 ? sponsorId || undefined : undefined,
            linkedSponsorshipId: fundingAmounts.sponsoredAmount > 0 ? linkedSponsorshipId || undefined : undefined,
          };
          if (isAssetPurchase) {
            const quantity = Number(assetQty);
            if (!Number.isInteger(quantity) || quantity <= 0) {
              toast.error("Quantity must be greater than 0.");
              return;
            }
            setBusy(true);
            writes
              .addAssetPurchase({
                ...payload,
                asset: {
                  name: assetName.trim() || name,
                  category: assetCategory,
                  quantity,
                  unit: assetUnit,
                  estimatedValue: assetValue.trim() ? Number(assetValue) : undefined,
                  condition: assetCondition,
                  location: assetLocation,
                },
              })
              .then(async ({ expenseId }) => {
                setSavedId(expenseId);
                if (!receipt) {
                  back();
                  return;
                }
                const uploaded = await persistReceipt(expenseId, receipt);
                if (uploaded) back();
              })
              .catch((error) => {
                logError("ganesh.addAssetPurchase", error);
                toast.error(friendlyErrorMessage(error, "Could not save asset purchase."));
              })
              .finally(() => setBusy(false));
            return;
          }
          setBusy(true);
          writes
            .addExpense(payload)
            .then(async (id) => {
              setSavedId(id);
              if (!receipt) {
                back();
                return;
              }
              const uploaded = await persistReceipt(id, receipt);
              if (uploaded) back();
            })
            .catch((error) => {
              logError("ganesh.addExpense", error);
              toast.error(friendlyErrorMessage(error, "Could not save expense."));
            })
            .finally(() => setBusy(false));
        }}
      >
        {isAssetPurchase ? "Save purchase" : "Save expense"}
      </Button>
    </GaneshScreen>
  );
}

function ExpenseKindCard({
  selected,
  disabled,
  icon,
  title,
  description,
  onPress,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      accessibilityLabel={`${title}. ${description}`}
      style={({ pressed }) => [
        styles.kindCard,
        {
          backgroundColor: selected ? g.wash(g.saffron) : theme.colors.card,
          borderColor: selected ? g.wash(g.saffron) : g.divider,
        },
        disabled && !selected ? { opacity: 0.45 } : null,
        pressed && !disabled ? { opacity: 0.85 } : null,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.kindTitle,
          {
            color: selected ? g.saffron : theme.colors.foreground,
            fontFamily: theme.fontFamily.semibold,
          },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.kindDescription,
          { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
        ]}
      >
        {description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kindRow: {
    flexDirection: "row",
    gap: 10,
  },
  kindCard: {
    flex: 1,
    minHeight: 112,
    padding: 12,
    gap: 6,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  kindTitle: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  kindDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
});
