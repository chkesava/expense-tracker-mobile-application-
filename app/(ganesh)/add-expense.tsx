import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Receipt } from "lucide-react-native";

import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  MoreDetails,
  Money,
  Section,
  StatTile,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
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
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_UNITS } from "@/shared/utils/ganeshAssets";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { purposeLabelOf } from "@/shared/utils/ganeshSponsors";

type Funding = "god" | "personal" | "split" | "sponsored";

const FUNDING_LABELS: Record<Funding, string> = {
  god: "God Fund",
  personal: "Personal money",
  split: "Split",
  sponsored: "Sponsored",
};

export default function AddExpenseScreen() {
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { realUser } = useAuth();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { categories } = useGaneshCategories(pandalId, festivalId);
  const { members } = usePandalMembers(pandalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { isOnline, uploadExpenseReceipt } = useGaneshStorage();

  const visibleCategories = categories.filter((category) => !category.disabled);
  const canLinkSponsor = can("sponsors.receive");
  const canBuyAsset = can("assets.create");
  const openExpenseDeals = sponsorships.filter(
    (row) =>
      row.sponsoringType === "expense"
      && (row.status === "promised" || row.status === "confirmed")
  );

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
  const [assetCategory, setAssetCategory] =
    useState<(typeof ASSET_CATEGORIES)[number]["id"]>("furniture");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetValue, setAssetValue] = useState("");
  const [assetCondition, setAssetCondition] =
    useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [receipt, setReceipt] = useState<PreparedGaneshImage | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedCategory =
    visibleCategories.find((category) => category.id === categoryId) ?? visibleCategories[0];
  const closed = festivals.find((item) => item.id === festivalId)?.status === "closed";
  const festival = festivals.find((item) => item.id === festivalId);
  const ledgerSaved = Boolean(savedId);
  const isAssetPurchase = kind === "asset_purchase" && canBuyAsset;

  const memberOptions = useMemo(
    () =>
      members
        .filter((member) => member.status === "active" || member.status == null)
        .map((member) => ({ id: member.userId, label: member.displayName })),
    [members]
  );

  const resolvedFunding = () => {
    const totalAmount = Number(total);
    if (funding === "god") {
      return { totalAmount, godFundAmount: totalAmount, personalAmount: 0, sponsoredAmount: 0 };
    }
    if (funding === "personal") {
      return { totalAmount, godFundAmount: 0, personalAmount: totalAmount, sponsoredAmount: 0 };
    }
    if (funding === "sponsored") {
      return { totalAmount, godFundAmount: 0, personalAmount: 0, sponsoredAmount: totalAmount };
    }
    return {
      totalAmount,
      godFundAmount: Number(godFund),
      personalAmount: Number(personal),
      sponsoredAmount: Number(sponsored || 0),
    };
  };

  const splitParts = resolvedFunding();
  const splitSum =
    splitParts.godFundAmount + splitParts.personalAmount + splitParts.sponsoredAmount;
  const splitMismatch =
    funding === "split"
    && Number.isFinite(splitParts.totalAmount)
    && splitParts.totalAmount > 0
    && Math.abs(splitSum - splitParts.totalAmount) > 0.01;

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

  const onSubmit = () => {
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
      linkedSponsorshipId:
        fundingAmounts.sponsoredAmount > 0 ? linkedSponsorshipId || undefined : undefined,
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
  };

  const fundingOptions: Array<{ id: Funding; label: string }> = (
    ["god", "personal", "split", ...(canLinkSponsor ? (["sponsored"] as const) : [])] as Funding[]
  ).map((item) => ({ id: item, label: FUNDING_LABELS[item] }));

  const parsedTotal = Number(total);
  const optionalFilled = [vendor, notes].filter((value) => value.trim()).length;

  return (
    <FormShell
      title={isAssetPurchase ? "Add asset purchase" : "Add expense"}
      subtitle={festival?.name}
      icon={<Receipt size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel={isAssetPurchase ? "Save purchase" : "Save expense"}
      submitting={busy}
      submitDisabled={
        closed
        || ledgerSaved
        || !name.trim()
        || !Number.isFinite(parsedTotal)
        || parsedTotal <= 0
        || splitMismatch
      }
      onSubmit={onSubmit}
      footerHint={
        closed ? (
          <StatusStrip tone="muted" message="This festival is closed. Expenses cannot be added." />
        ) : splitMismatch ? (
          <StatusStrip
            tone="warning"
            message={`Split adds up to ${formatInr(splitSum)} but the total is ${formatInr(
              splitParts.totalAmount
            )}.`}
          />
        ) : receiptStatus === "waiting" ? (
          <StatusStrip
            tone="warning"
            message="Expense saved. The receipt uploads as soon as you are back online."
          />
        ) : null
      }
    >
      <Section title="What was bought" plain>
        <View style={styles.form}>
          {canBuyAsset ? (
            <FilterChips
              label="Type"
              value={isAssetPurchase ? "asset_purchase" : "normal"}
              options={[
                { id: "normal", label: "Regular expense" },
                { id: "asset_purchase", label: "Asset purchase" },
              ]}
              onChange={setKind}
              disabled={ledgerSaved}
            />
          ) : null}

          {isAssetPurchase ? (
            <StatusStrip
              tone="info"
              message="This records the spend and adds the item to Pandal assets. Money stays on the festival; ownership stays with the Pandal."
            />
          ) : null}

          <Input
            label="Expense name"
            value={name}
            onChangeText={setName}
            placeholder="Flowers"
            editable={!ledgerSaved}
            autoCapitalize="sentences"
          />
          <Input
            label="Amount"
            value={total}
            onChangeText={setTotal}
            keyboardType="numeric"
            placeholder="0"
            editable={!ledgerSaved}
          />

          {visibleCategories.length > 0 ? (
            <FilterChips
              label="Category"
              value={categoryId || visibleCategories[0]?.id}
              options={visibleCategories.map((category) => ({
                id: category.id,
                label: category.name,
              }))}
              onChange={setCategoryId}
              disabled={ledgerSaved}
            />
          ) : (
            <StatusStrip
              tone="warning"
              message="No expense categories yet. A Pandal Admin can add them in Admin → Expense categories."
            />
          )}
        </View>
      </Section>

      <Section
        title="Who paid"
        subtitle="God Fund is the deity's money. Personal money is fronted by a member and owed back."
      >
        <View style={styles.form}>
          <FilterChips
            label="Funding"
            value={funding}
            options={fundingOptions}
            onChange={setFunding}
            disabled={ledgerSaved}
          />

          {funding === "split" ? (
            <>
              <View style={styles.statRow}>
                <StatTile label="God Fund">
                  <Money
                    value={Number(godFund) || 0}
                    size="secondary"
                    tone="positive"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  />
                </StatTile>
                <StatTile label="Personal">
                  <Money
                    value={Number(personal) || 0}
                    size="secondary"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  />
                </StatTile>
                <StatTile label="Total">
                  <Money
                    value={splitSum}
                    size="secondary"
                    tone={splitMismatch ? "warning" : "default"}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  />
                </StatTile>
              </View>
              <Input
                label="God Fund amount"
                value={godFund}
                onChangeText={setGodFund}
                keyboardType="numeric"
                editable={!ledgerSaved}
              />
              <Input
                label="Personal amount"
                value={personal}
                onChangeText={setPersonal}
                keyboardType="numeric"
                editable={!ledgerSaved}
              />
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

          {memberOptions.length > 1 ? (
            <FilterChips
              label="Paid by"
              value={paidByMemberId}
              options={memberOptions}
              onChange={setPaidByMemberId}
              disabled={ledgerSaved}
            />
          ) : null}

          {!canLinkSponsor ? (
            <StatusStrip
              tone="muted"
              message="Linking a sponsored amount needs permission to mark a sponsorship received."
            />
          ) : null}
        </View>
      </Section>

      {canLinkSponsor
      && (funding === "sponsored" || (funding === "split" && Number(sponsored || 0) > 0)) ? (
        <Section
          title="Sponsorship"
          subtitle="A sponsored amount is not income. Pick an open expense deal, or the sponsor."
        >
          <View style={styles.form}>
            {openExpenseDeals.length > 0 ? (
              <FilterChips
                label="Open expense sponsorship"
                value={linkedSponsorshipId}
                options={[
                  { id: "", label: "New deal" },
                  ...openExpenseDeals.map((deal) => ({
                    id: deal.id,
                    label: `${
                      sponsors.find((item) => item.id === deal.sponsorId)?.name ?? "Sponsor"
                    } · ${purposeLabelOf(deal.purpose, deal.purposeLabel)} · ${formatInr(
                      deal.amount
                    )}`,
                  })),
                ]}
                disabled={ledgerSaved}
                onChange={(next) => {
                  setLinkedSponsorshipId(next);
                  const deal = openExpenseDeals.find((row) => row.id === next);
                  if (deal) setSponsorId(deal.sponsorId);
                }}
              />
            ) : null}

            {!linkedSponsorshipId ? (
              sponsors.length > 0 ? (
                <FilterChips
                  label="Sponsor"
                  value={sponsorId}
                  options={sponsors.map((item) => ({ id: item.id, label: item.name }))}
                  onChange={setSponsorId}
                  disabled={ledgerSaved}
                />
              ) : (
                <StatusStrip
                  tone="warning"
                  message="No sponsors yet. Add one from Pandal → Sponsors first."
                />
              )
            ) : null}
          </View>
        </Section>
      ) : null}

      {isAssetPurchase ? (
        <Section title="Asset details" subtitle="What goes into the Pandal store">
          <View style={styles.form}>
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
            <FilterChips
              label="Category"
              value={assetCategory}
              options={ASSET_CATEGORIES}
              onChange={setAssetCategory}
              disabled={ledgerSaved}
            />
            <FilterChips
              label="Unit"
              value={assetUnit}
              options={ASSET_UNITS}
              onChange={setAssetUnit}
              disabled={ledgerSaved}
            />
            <FilterChips
              label="Condition"
              value={assetCondition}
              options={ASSET_CONDITIONS}
              onChange={setAssetCondition}
              disabled={ledgerSaved}
            />
            <Input
              label="Estimated value (optional)"
              value={assetValue}
              onChangeText={setAssetValue}
              keyboardType="numeric"
              editable={!ledgerSaved}
            />
            <Input
              label="Location (optional)"
              value={assetLocation}
              onChangeText={setAssetLocation}
              editable={!ledgerSaved}
            />
          </View>
        </Section>
      ) : null}

      <Section title="Receipt" plain>
        <GaneshImageUploader
          title="Receipt photo"
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
      </Section>

      <MoreDetails filledCount={optionalFilled}>
        <Input
          label="Vendor"
          value={vendor}
          onChangeText={setVendor}
          editable={!ledgerSaved}
        />
        <Input label="Notes" value={notes} onChangeText={setNotes} editable={!ledgerSaved} />
      </MoreDetails>
    </FormShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
});
