import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshExpenses } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalAssetAudits, usePandalAssets } from "@/hooks/usePandalAssets";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_OWNERSHIP,
  ASSET_UNITS,
  assetOwnershipLabel,
  assetStatusLabel,
  assetUnitLabel,
} from "@/shared/utils/ganeshAssets";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function AssetDetailScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { assets } = usePandalAssets(pandalId);
  const { audits } = usePandalAssetAudits(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { expenses } = useGaneshExpenses(pandalId, festivalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const { isOnline, signedUrl, uploadAssetPhoto } = useGaneshStorage();
  const asset = assets.find((item) => item.id === id);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("furniture");
  const [unit, setUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [ownership, setOwnership] = useState<(typeof ASSET_OWNERSHIP)[number]["id"]>("purchased");
  const [condition, setCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [qtyReason, setQtyReason] = useState("");
  const [disposeReason, setDisposeReason] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [photoStatus, setPhotoStatus] = useState<GaneshUploadStatus>("idle");
  const [busy, setBusy] = useState(false);
  const photoPath = ganeshStoredPath(asset?.photo);
  const relatedExpense = expenses.find((item) => item.id === asset?.relatedExpenseId);
  const recentAudits = useMemo(
    () => audits.filter((item) => item.assetId === id).slice(0, 12),
    [audits, id]
  );

  useEffect(() => {
    if (!asset) return;
    setName(asset.name);
    setCategory(asset.category);
    setUnit(asset.unit);
    setOwnership(asset.ownershipType);
    setCondition(asset.condition);
    setEstimatedValue(asset.estimatedValue != null ? String(asset.estimatedValue) : "");
    setLocation(asset.location ?? "");
    setDescription(asset.description ?? "");
    setSourceName(asset.sourceName ?? "");
    setQuantity(String(asset.quantity));
    setDisposeReason(asset.disposeReason ?? "");
  }, [asset?.id, asset?.updatedAt?.seconds]);

  useEffect(() => {
    if (!photoPath || !pandalId) {
      setPhotoUrl(undefined);
      return;
    }
    let cancelled = false;
    signedUrl(photoPath)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPhotoUrl(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [pandalId, photoPath, signedUrl]);

  if (!can("assets.read")) {
    return <GaneshWriteLock message="Your role cannot view Pandal assets." />;
  }

  if (!asset) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Asset not found
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          It may have been removed from this view, or it belongs to another Pandal.
        </Text>
      </GaneshScreen>
    );
  }

  const canEdit = can("assets.update") && asset.status !== "disposed";
  const canDispose = can("assets.dispose") && asset.status !== "disposed";

  const run = (work: Promise<unknown>, fallback: string) => {
    setBusy(true);
    work
      .catch((error) => {
        logError("ganesh.assetDetail", error);
        toast.error(friendlyErrorMessage(error, fallback));
      })
      .finally(() => setBusy(false));
  };

  return (
    <GaneshScreen>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: "100%", height: 220, borderRadius: 16 }}
        />
      ) : null}
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        {asset.name}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {asset.quantity} {assetUnitLabel(asset.unit, asset.quantity)} · {assetStatusLabel(asset.status)}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Added by {memberDisplayName(members, asset.createdBy)}
        {asset.createdAt ? ` · ${formatGaneshWhen(asset.createdAt)}` : ""}
      </Text>
      <PendingHint pending={asset.pendingWrite} />
      {asset.estimatedValue > 0 ? (
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
          Estimated value {formatInr(asset.estimatedValue)}
        </Text>
      ) : null}
      <Text style={{ color: theme.colors.mutedForeground }}>
        {assetOwnershipLabel(asset.ownershipType)}
        {asset.sourceName ? ` · ${asset.sourceName}` : ""}
      </Text>
      {relatedExpense ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Linked expense: {relatedExpense.name} · {formatInr(relatedExpense.totalAmount)}
        </Text>
      ) : null}

      {canEdit ? (
        <View style={{ gap: 16 }}>
          <Input label="Name" value={name} onChangeText={setName} />
          <ChoiceChips label="Category" value={category} options={ASSET_CATEGORIES} onChange={setCategory} />
          <ChoiceChips label="Unit" value={unit} options={ASSET_UNITS} onChange={setUnit} />
          <ChoiceChips
            label="Ownership"
            value={ownership}
            options={ASSET_OWNERSHIP}
            onChange={setOwnership}
          />
          {ownership === "donated" || ownership === "sponsored" || ownership === "transferred" || ownership === "other" ? (
            <Input label="Source note" value={sourceName} onChangeText={setSourceName} />
          ) : null}
          <ChoiceChips
            label="Condition"
            value={condition}
            options={ASSET_CONDITIONS}
            onChange={setCondition}
          />
          <Input
            label="Estimated value"
            value={estimatedValue}
            onChangeText={setEstimatedValue}
            keyboardType="numeric"
          />
          <Input label="Location" value={location} onChangeText={setLocation} />
          <Input label="Description" value={description} onChangeText={setDescription} />
          <Button
            loading={busy}
            onPress={() =>
              run(
                writes.updatePandalAsset(asset.id, {
                  name,
                  category,
                  unit,
                  ownershipType: ownership,
                  condition,
                  estimatedValue: estimatedValue.trim() ? Number(estimatedValue) : 0,
                  location,
                  description,
                  sourceName,
                }),
                "Could not update asset."
              )
            }
          >
            Save details
          </Button>
          <Input
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />
          <Input
            label="Reason for quantity change"
            value={qtyReason}
            onChangeText={setQtyReason}
            placeholder="Broken, extra stock, count correction"
          />
          <Button
            variant="outline"
            loading={busy}
            onPress={() =>
              run(
                writes.adjustAssetQuantity(asset.id, {
                  newQuantity: Number(quantity),
                  reason: qtyReason,
                  status: Number(quantity) === 0 ? "disposed" : undefined,
                }),
                "Could not change quantity."
              )
            }
          >
            Update quantity
          </Button>
          {can("assets.create") || can("assets.update") ? (
            <GaneshImageUploader
              title="Replace photo"
              kind="photo"
              status={photoStatus}
              previewUri={photo?.uri}
              disabled={busy || !isOnline}
              onPrepared={(file) => {
                setPhoto(file);
                setPhotoStatus("selected");
                setBusy(true);
                uploadAssetPhoto(asset.id, file)
                  .then(() => setPhotoStatus("uploaded"))
                  .catch((error) => {
                    logError("ganesh.assetPhotoUpload", error);
                    setPhotoStatus("failed");
                    toast.error(friendlyErrorMessage(error, "Could not upload photo."));
                  })
                  .finally(() => setBusy(false));
              }}
              onRemove={() => {
                setPhoto(null);
                setPhotoStatus("idle");
              }}
            />
          ) : null}
        </View>
      ) : null}

      {canDispose ? (
        <View style={{ gap: 12 }}>
          <Input
            label="Dispose or lost reason"
            value={disposeReason}
            onChangeText={setDisposeReason}
            placeholder="Broken beyond repair"
          />
          <Button
            variant="outline"
            loading={busy}
            onPress={() => {
              Alert.alert("Mark as lost?", "The item stays in history. This does not change cash.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Mark lost",
                  style: "destructive",
                  onPress: () =>
                    run(
                      writes.setAssetStatus(asset.id, { status: "lost", reason: disposeReason }),
                      "Could not update status."
                    ),
                },
              ]);
            }}
          >
            Mark lost
          </Button>
          <Button
            variant="outline"
            loading={busy}
            onPress={() => {
              Alert.alert("Dispose this item?", "It stays in history and is hidden from the active list.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Dispose",
                  style: "destructive",
                  onPress: () =>
                    run(
                      writes.setAssetStatus(asset.id, { status: "disposed", reason: disposeReason }),
                      "Could not dispose asset."
                    ),
                },
              ]);
            }}
          >
            Dispose
          </Button>
        </View>
      ) : null}

      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Recent activity</Text>
      {recentAudits.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>No changes recorded yet.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {recentAudits.map((item) => (
            <View
              key={item.id}
              style={{
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 12,
                gap: 4,
              }}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                {item.action}
              </Text>
              <Text style={{ color: theme.colors.mutedForeground }}>
                {memberDisplayName(members, item.actorId)}
                {item.at ? ` · ${formatGaneshWhen(item.at)}` : ""}
              </Text>
              {item.reason ? (
                <Text style={{ color: theme.colors.mutedForeground }}>{item.reason}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </GaneshScreen>
  );
}
