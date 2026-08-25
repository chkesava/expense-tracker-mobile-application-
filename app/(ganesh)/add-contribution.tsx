import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Check, Gift } from "lucide-react-native";

import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  MoreDetails,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { ContributionKind, ContributionStatus } from "@/shared/types/ganesh";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_UNITS } from "@/shared/utils/ganeshAssets";
import { useTheme } from "@/theme/ThemeProvider";

const KIND_OPTIONS: Array<{ id: ContributionKind; label: string }> = [
  { id: "money", label: "Money" },
  { id: "item", label: "Item" },
  { id: "service", label: "Service" },
  { id: "sponsorship", label: "Sponsorship" },
];

const STATUS_OPTIONS: Array<{ id: ContributionStatus; label: string }> = [
  { id: "promised", label: "Promised" },
  { id: "received", label: "Received" },
  { id: "cancelled", label: "Cancelled" },
];

const PHOTO_KINDS: ContributionKind[] = ["item", "service", "sponsorship"];

export default function AddContributionScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { isOnline, uploadContributionPhoto } = useGaneshStorage();

  const [kind, setKind] = useState<ContributionKind>("item");
  const [status, setStatus] = useState<ContributionStatus>("promised");
  const [contributorName, setContributorName] = useState("");
  const [mobile, setMobile] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDate, setExpectedDate] = useState(todayDateInput());
  const [addAsAsset, setAddAsAsset] = useState(false);
  const [assetCategory, setAssetCategory] =
    useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] =
    useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [photoStatus, setPhotoStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allowsPhoto = PHOTO_KINDS.includes(kind);
  const canLinkAsset =
    can("assets.create") && status === "received" && (kind === "item" || kind === "sponsorship");
  const ledgerSaved = Boolean(savedId);
  const isMoney = kind === "money";

  const persistPhoto = async (contributionId: string, file: PreparedGaneshImage) => {
    if (!isOnline) {
      setPhotoStatus("waiting");
      return false;
    }
    setPhotoStatus("uploading");
    try {
      await uploadContributionPhoto(contributionId, file);
      setPhotoStatus("uploaded");
      return true;
    } catch (error) {
      logError("ganesh.photoUpload", error);
      setPhotoStatus("failed");
      toast.error("Contribution saved, but photo upload failed.");
      return false;
    }
  };

  useEffect(() => {
    if (!isOnline || photoStatus !== "waiting" || !savedId || !photo) return;
    setBusy(true);
    void persistPhoto(savedId, photo)
      .then((ok) => {
        if (ok) back();
      })
      .finally(() => setBusy(false));
  }, [isOnline, photoStatus, savedId, photo]);

  if (!can("contributions.create")) {
    return <GaneshWriteLock message="Your role cannot add contributions." />;
  }

  const onSubmit = () => {
    if (addAsAsset && canLinkAsset) {
      const qty = Number(assetQty || quantity || 0);
      if (!Number.isInteger(qty) || qty <= 0) {
        toast.error("Asset quantity must be greater than 0.");
        return;
      }
      if (!(itemName.trim() || contributorName.trim())) {
        toast.error("Enter an item name to add as a Pandal asset.");
        return;
      }
    }
    setBusy(true);
    writes
      .addContribution({
        kind,
        contributorName,
        mobile,
        itemName,
        quantity,
        amount: Number(amount || 0),
        estimatedValue: Number(estimatedValue || 0),
        description,
        date: todayDateInput(),
        expectedDate: status === "promised" ? expectedDate : undefined,
        status,
        pandalAsset:
          addAsAsset && canLinkAsset
            ? {
                name: itemName.trim() || contributorName.trim(),
                category: assetCategory,
                quantity: Number(assetQty || quantity || 0),
                unit: assetUnit,
                estimatedValue: Number(estimatedValue || 0),
                condition: assetCondition,
                location: assetLocation,
              }
            : undefined,
      })
      .then(async (id) => {
        setSavedId(id);
        if (!allowsPhoto || !photo) {
          back();
          return;
        }
        const uploaded = await persistPhoto(id, photo);
        if (uploaded) back();
      })
      .catch((error) => {
        logError("ganesh.addContribution", error);
        toast.error(friendlyErrorMessage(error, "Could not save contribution."));
      })
      .finally(() => setBusy(false));
  };

  const valueValid = isMoney
    ? Number(amount || 0) > 0
    : Boolean(itemName.trim()) && Number(estimatedValue || 0) >= 0;
  const optionalFilled = [mobile, description, quantity].filter((value) => value.trim()).length;

  return (
    <FormShell
      title="Add contribution"
      subtitle={festival?.name}
      icon={<Gift size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel="Save contribution"
      submitting={busy}
      submitDisabled={ledgerSaved || !contributorName.trim() || !valueValid}
      onSubmit={onSubmit}
      footerHint={
        photoStatus === "waiting" ? (
          <StatusStrip
            tone="warning"
            message="Contribution saved. The photo uploads as soon as you are back online."
          />
        ) : status === "promised" ? (
          <StatusStrip
            tone="info"
            message="A promised contribution is not cash. Totals change only when you mark it received."
          />
        ) : null
      }
    >
      <Section title="What is being given" plain>
        <View style={styles.form}>
          <FilterChips
            label="Type"
            value={kind}
            options={KIND_OPTIONS}
            disabled={ledgerSaved}
            onChange={(next) => {
              setKind(next);
              if (next !== "item" && next !== "sponsorship") setAddAsAsset(false);
              if (!PHOTO_KINDS.includes(next)) {
                setPhoto(null);
                setPhotoStatus("idle");
              }
            }}
          />
          <FilterChips
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            disabled={ledgerSaved}
            onChange={(next) => {
              setStatus(next);
              if (next !== "received") setAddAsAsset(false);
            }}
          />
        </View>
      </Section>

      <Section
        title="Contributor"
        subtitle="Who gave it — you are only recording it."
      >
        <View style={styles.form}>
          <Input
            label="Name"
            value={contributorName}
            onChangeText={setContributorName}
            placeholder="Suresh Kumar"
            autoCapitalize="words"
            editable={!ledgerSaved}
          />
        </View>
      </Section>

      <Section title={isMoney ? "Amount" : "Item details"} plain>
        <View style={styles.form}>
          {isMoney ? (
            <Input
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              editable={!ledgerSaved}
            />
          ) : (
            <>
              <Input
                label="Item or service"
                value={itemName}
                onChangeText={setItemName}
                placeholder="Ganesh idol"
                autoCapitalize="sentences"
                editable={!ledgerSaved}
              />
              <Input
                label="Estimated value"
                value={estimatedValue}
                onChangeText={setEstimatedValue}
                keyboardType="numeric"
                placeholder="0"
                editable={!ledgerSaved}
              />
            </>
          )}

          {status === "promised" ? (
            <Input
              label="Expected date"
              value={expectedDate}
              onChangeText={setExpectedDate}
              placeholder="YYYY-MM-DD"
              editable={!ledgerSaved}
            />
          ) : null}
        </View>
      </Section>

      {canLinkAsset ? (
        <Section
          title="Pandal asset"
          subtitle="Adds inventory only. This does not create an expense or change cash."
        >
          <View style={styles.form}>
            <Pressable
              disabled={ledgerSaved}
              onPress={() => {
                void haptic.selection();
                setAddAsAsset((prev) => !prev);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: addAsAsset }}
              accessibilityLabel="Also add as Pandal asset"
              style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.85 }]}
            >
              <View
                style={[
                  styles.checkbox,
                  addAsAsset
                    ? { backgroundColor: g.saffron, borderColor: g.saffron }
                    : { borderColor: g.divider },
                ]}
              >
                {addAsAsset ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <Text
                style={[
                  styles.checkLabel,
                  { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                Also add this to Pandal assets
              </Text>
            </Pressable>

            {addAsAsset ? (
              <>
                <Input
                  label="Asset quantity"
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
                  label="Location (optional)"
                  value={assetLocation}
                  onChangeText={setAssetLocation}
                  editable={!ledgerSaved}
                />
              </>
            ) : null}
          </View>
        </Section>
      ) : null}

      {allowsPhoto ? (
        <Section title="Photo" plain>
          <GaneshImageUploader
            title="Contribution photo"
            kind="photo"
            status={photoStatus}
            previewUri={photo?.uri}
            disabled={busy}
            onPrepared={(file) => {
              setPhoto(file);
              setPhotoStatus("selected");
            }}
            onRemove={() => {
              setPhoto(null);
              setPhotoStatus("idle");
            }}
            onRetry={() => {
              if (!savedId || !photo) return;
              setBusy(true);
              void persistPhoto(savedId, photo)
                .then((ok) => {
                  if (ok) back();
                })
                .finally(() => setBusy(false));
            }}
          />
        </Section>
      ) : null}

      <MoreDetails filledCount={optionalFilled}>
        <Input
          label="Mobile"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          editable={!ledgerSaved}
        />
        {!isMoney ? (
          <Input
            label="Quantity note"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="1 idol, 5 kg"
            editable={!ledgerSaved}
          />
        ) : null}
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          editable={!ledgerSaved}
        />
      </MoreDetails>
    </FormShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderCurve: "continuous",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
});
