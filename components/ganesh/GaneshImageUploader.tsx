import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { Button } from "@/components/ui/Button";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { GaneshUploadStatus } from "@/hooks/useGaneshPhotoUpload";
import { prepareGaneshImage } from "@/services/ganesh/storage/storageService";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import { useTheme } from "@/theme/ThemeProvider";

export type { GaneshUploadStatus } from "@/hooks/useGaneshPhotoUpload";

type Props = {
  title: string;
  kind: "receipt" | "photo";
  status: GaneshUploadStatus;
  previewUri?: string | null;
  disabled?: boolean;
  onPrepared: (file: PreparedGaneshImage) => void;
  onRemove: () => void;
  onRetry?: () => void;
};

export function GaneshImageUploader({
  title,
  kind,
  status,
  previewUri,
  disabled,
  onPrepared,
  onRemove,
  onRetry,
}: Props) {
  const { theme } = useTheme();
  const [picking, setPicking] = useState(false);
  const noun = kind === "photo" ? "Photo" : "Receipt";

  const pick = async (source: "camera" | "gallery") => {
    if (disabled || status === "uploading" || status === "uploaded") return;
    setPicking(true);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          toast.error("Camera access is required to take a photo.");
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          toast.error("Photo library access is required to choose an image.");
          return;
        }
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      const prepared = await prepareGaneshImage({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        width: asset.width,
        height: asset.height,
        kind,
      });
      onPrepared(prepared);
    } catch (error) {
      logError("ganesh.imagePick", error);
      toast.error(friendlyErrorMessage(error, "Could not prepare that image."));
    } finally {
      setPicking(false);
    }
  };

  const statusLabel =
    status === "uploading"
      ? "Uploading..."
      : status === "uploaded"
        ? "Uploaded ✓"
        : status === "queued"
          ? `${noun} queued for upload`
          : status === "failed"
            ? "⚠ Upload failed"
            : status === "selected"
              ? `${noun} selected`
              : null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.colors.mutedForeground }]}>{title}</Text>
      {previewUri ? (
        <Image source={{ uri: previewUri }} style={styles.preview} />
      ) : null}
      {statusLabel ? (
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{statusLabel}</Text>
      ) : null}
      {status === "queued" ? (
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 19 }}>
          {`The ${noun.toLowerCase()} is saved on this device and will upload by itself when the connection allows. You can leave this screen — if the app is closed first, it resumes the next time you open it.`}
        </Text>
      ) : null}
      {status === "failed" ? (
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 19 }}>
          {`The ${noun.toLowerCase()} has stopped retrying. Your record is saved without it — retry below, or add it later from the record.`}
        </Text>
      ) : null}
      {status === "idle" || status === "selected" || status === "failed" ? (
        <View style={styles.row}>
          <Button
            variant="outline"
            disabled={disabled || picking}
            loading={picking}
            onPress={() => {
              void pick("gallery");
            }}
          >
            {previewUri ? "Change from gallery" : "Add from gallery"}
          </Button>
          <Button
            variant="outline"
            disabled={disabled || picking}
            onPress={() => {
              void pick("camera");
            }}
          >
            Camera
          </Button>
        </View>
      ) : null}
      {status === "failed" && onRetry ? (
        <Button disabled={disabled} onPress={onRetry}>
          Retry upload
        </Button>
      ) : null}
      {previewUri && status !== "uploading" && status !== "uploaded" ? (
        <Pressable onPress={onRemove} disabled={disabled}>
          <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Remove</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { fontWeight: "700" },
  row: { gap: 8 },
  preview: {
    width: "100%",
    height: 180,
    borderRadius: 16,
    borderCurve: "continuous",
  },
});
