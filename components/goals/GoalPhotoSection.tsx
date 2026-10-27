import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { ImageIcon } from "lucide-react-native";

import { Section } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  GoalImageError,
  goalImageUrl,
  pickGoalImage,
  prepareGoalImage,
  removeGoalImage,
  replaceGoalImage,
  type PreparedGoalImage,
  type UploadStage,
} from "@/services/goals/goalImageStore";
import type { FinancialGoal } from "@/shared/types/expense";
import type { GoalImage } from "@/shared/types/goal";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

const STAGE_TEXT: Record<UploadStage, string> = {
  preparing: "Preparing photo… (1 of 3)",
  uploading: "Uploading… (2 of 3)",
  saving: "Saving to your goal… (3 of 3)",
  done: "Done",
};

/** A short-lived signed URL, cached by storage path (so the bytes are reused). */
function GoalImageView({ image, label }: { image: GoalImage; label: string }) {
  const { theme } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setUri(null);
    setFailed(false);
    goalImageUrl(image.path)
      .then((u) => !cancelled && setUri(u))
      .catch((error) => {
        logError("goalImage.url", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [image.path]);
  const ratio = image.width && image.height ? image.width / image.height : 4 / 3;
  if (failed) {
    return <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs }}>Couldn't load the photo. It will show when you're back online.</Text>;
  }
  return (
    <Image
      source={uri ? { uri, cacheKey: image.path } : undefined}
      style={[styles.image, { aspectRatio: ratio, borderRadius: theme.radius.md, backgroundColor: theme.colors.muted }]}
      contentFit="cover"
      accessibilityLabel={label}
      accessible
    />
  );
}

/**
 * A goal's photo (SPENDLY-614, FRD FR-12): choose from the library or take
 * one, replace or remove. Shows each stage of the upload and keeps the
 * prepared photo for Retry if it fails. The previous photo stays until the
 * new one is saved on the goal.
 */
export function GoalPhotoSection({
  goal,
  editable,
  saveImage,
}: {
  goal: FinancialGoal;
  editable: boolean;
  /** Writes the image metadata (or null) to the goal; resolves true when saved. */
  saveImage: (image: GoalImage | null) => Promise<boolean>;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { user } = useAuth();
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [failedUpload, setFailedUpload] = useState<PreparedGoalImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = stage !== null && stage !== "done";

  const upload = async (prepared: PreparedGoalImage) => {
    if (!user) return;
    setError(null);
    try {
      const ok = await replaceGoalImage({ uid: user.uid, goalId: goal.id, prepared, previous: goal.image, save: saveImage, onStage: setStage });
      setFailedUpload(ok ? null : prepared);
      if (!ok) setError("The photo couldn't be saved to the goal. Your previous photo is unchanged.");
    } catch (e) {
      logError("goalImage.upload", e);
      setFailedUpload(prepared);
      setError(friendlyErrorMessage(e, "The photo couldn't be uploaded. Your previous photo is unchanged."));
    } finally {
      setStage(null);
    }
  };

  const choose = async (source: "library" | "camera") => {
    if (busy) return;
    setError(null);
    try {
      const picked = await pickGoalImage(source);
      if (!picked) return;
      setStage("preparing");
      const prepared = await prepareGoalImage(picked);
      await upload(prepared);
    } catch (e) {
      setStage(null);
      if (e instanceof GoalImageError) setError(e.message);
      else {
        logError("goalImage.pick", e);
        setError(friendlyErrorMessage(e, "Couldn't use that photo."));
      }
    }
  };

  const remove = async () => {
    if (!goal.image || busy) return;
    const ok = await removeGoalImage(goal.image, () => saveImage(null));
    if (!ok) toast.error("Couldn't remove the photo.");
  };

  if (!goal.image && !editable) return null;
  const meta = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  return (
    <Section title="Photo" icon={<ImageIcon size={16} color={theme.colors.primary} />} iconTint={surfaces.wash(theme.colors.primary)}>
      <View style={{ gap: theme.space.sm }}>
        {goal.image ? <GoalImageView image={goal.image} label={`Photo for ${goal.name}`} /> : <Text style={meta}>Add a photo of what you're saving for.</Text>}
        {stage ? (
          <Text style={meta} accessibilityLiveRegion="polite">
            {STAGE_TEXT[stage]}
          </Text>
        ) : null}
        {error ? (
          <Text style={[meta, { color: theme.colors.destructive }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        {editable ? (
          <View style={styles.row}>
            {failedUpload ? (
              <Button variant="primary" size="sm" onPress={() => void upload(failedUpload)} disabled={busy}>
                Retry upload
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onPress={() => void choose("library")} disabled={busy} loading={busy}>
              {goal.image ? "Replace" : "Choose photo"}
            </Button>
            {Platform.OS !== "web" ? (
              <Button variant="secondary" size="sm" onPress={() => void choose("camera")} disabled={busy}>
                Take photo
              </Button>
            ) : null}
            {goal.image ? (
              <Button variant="ghost" size="sm" onPress={() => void remove()} disabled={busy}>
                Remove
              </Button>
            ) : null}
          </View>
        ) : null}
        <Text style={meta}>Photos are private to you. JPEG, PNG, WebP or HEIC; resized to 1600 px.</Text>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
