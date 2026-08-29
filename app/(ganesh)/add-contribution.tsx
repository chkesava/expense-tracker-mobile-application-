import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Gift } from "lucide-react-native";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { ContributionKind, ContributionStatus } from "@/shared/types/ganesh";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_UNITS,
} from "@/shared/utils/ganeshAssets";
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
// Recording something as already received IS receiving it, and the rules now
// enforce contributions.receive on create as well as on the transition
// (GS-037). Without this the option rendered and the save failed at the server.
const PROMISE_ONLY_STATUS_OPTIONS = STATUS_OPTIONS.filter((option) => option.id !== "received");
const PHOTO_KINDS: ContributionKind[] = ["item", "service", "sponsorship"];

export default function AddContributionScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
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
  const [assetCategory, setAssetCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [photoStatus, setPhotoStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canReceive = can("contributions.receive");
  const statusOptions = canReceive ? STATUS_OPTIONS : PROMISE_ONLY_STATUS_OPTIONS;
  const allowsPhoto = PHOTO_KINDS.includes(kind);
  const canLinkAsset =
    can("assets.create") &&
    status === "received" &&
    (kind === "item" || kind === "sponsorship");
  const ledgerSaved = Boolean(savedId);

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

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Add contribution"
        icon={<Gift size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 21 }}>
        Contributor is who gave the item or money. You are only recording it. A promised
        contribution does not change festival cash.
      </Text>
      <ChoiceChips
        label="Type"
        value={kind}
        options={KIND_OPTIONS}
        disabled={ledgerSaved}
        onChange={(next) => {
          setKind(next);
          if (next !== "item" && next !== "sponsorship") {
            setAddAsAsset(false);
          }
          if (!PHOTO_KINDS.includes(next)) {
            setPhoto(null);
            setPhotoStatus("idle");
          }
        }}
      />
      <ChoiceChips
        label="Status"
        value={status}
        options={statusOptions}
        disabled={ledgerSaved}
        onChange={(next) => {
          setStatus(next);
          if (next !== "received") setAddAsAsset(false);
        }}
      />
      <Input
        label="Contributor"
        value={contributorName}
        onChangeText={setContributorName}
        placeholder="Suresh Kumar"
        editable={!ledgerSaved}
      />
      {kind === "money" ? (
        <Input
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          editable={!ledgerSaved}
        />
      ) : (
        <>
          <Input
            label="Item / service"
            value={itemName}
            onChangeText={setItemName}
            placeholder="Ganesh Idol"
            editable={!ledgerSaved}
          />
          <Input
            label="Quantity (optional)"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="1"
            editable={!ledgerSaved}
          />
          <Input
            label="Estimated value"
            value={estimatedValue}
            onChangeText={setEstimatedValue}
            keyboardType="numeric"
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
      <FormDetails>
        <Input
          label="Mobile (optional)"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          editable={!ledgerSaved}
        />
        <Input
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          editable={!ledgerSaved}
        />
      {canLinkAsset ? (
        <View style={{ gap: 12 }}>
          <ChoiceChips
            label="Pandal asset"
            value={addAsAsset ? "yes" : "no"}
            options={[
              { id: "no", label: "Contribution only" },
              { id: "yes", label: "Also add as Pandal asset" },
            ]}
            onChange={(next) => setAddAsAsset(next === "yes")}
            disabled={ledgerSaved}
          />
          {addAsAsset ? (
            <>
              <Text style={{ color: theme.colors.mutedForeground }}>
                Adds inventory only. This does not create an expense or change cash.
              </Text>
              <Input
                label="Asset quantity"
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
              <ChoiceChips
                label="Unit"
                value={assetUnit}
                options={ASSET_UNITS}
                onChange={setAssetUnit}
                disabled={ledgerSaved}
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
            </>
          ) : null}
        </View>
      ) : null}
      {allowsPhoto ? (
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
      ) : null}
      </FormDetails>
      <Button
        loading={busy}
        disabled={ledgerSaved}
        onPress={() => {
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
        }}
      >
        Save contribution
      </Button>
    </GaneshScreen>
  );
}
