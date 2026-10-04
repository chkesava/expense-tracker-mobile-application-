import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Check, RotateCcw, X } from "lucide-react-native";

import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { MerchantOverride, MerchantResolution, MerchantSourceText } from "@/shared/types/merchant";
import { buildMerchantAliasIndex } from "@/shared/data/merchantRegistry";
import { foldKey } from "@/shared/utils/merchantModel";
import { deleteMerchantOverride, saveMerchantOverride } from "@/services/merchant/merchantOverrideStore";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

export interface MerchantCorrectionSheetProps {
  visible: boolean;
  source: MerchantSourceText;
  resolution: MerchantResolution;
  existingOverride?: MerchantOverride;
  initialCategory?: string;
  initialSubcategory?: string;
  onClose: () => void;
  onSaved: () => void;
  onOpenProfile?: () => void;
}

export function MerchantCorrectionSheet({
  visible,
  source,
  resolution,
  existingOverride,
  initialCategory = "Food & Groceries",
  initialSubcategory = "Other Food",
  onClose,
  onSaved,
  onOpenProfile,
}: MerchantCorrectionSheetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [subcategory, setSubcategory] = useState(initialSubcategory);
  const [saving, setSaving] = useState(false);
  const aliasIndex = useMemo(() => buildMerchantAliasIndex(), []);

  useEffect(() => {
    if (!visible) return;
    setName(existingOverride?.customName ?? resolution.displayName);
    setCategory(existingOverride?.category ?? resolution.suggestedCategory ?? initialCategory);
    setSubcategory(existingOverride?.subcategory ?? resolution.suggestedSubcategory ?? initialSubcategory);
  }, [visible, existingOverride, resolution, initialCategory, initialSubcategory]);

  const save = async (draft: Omit<MerchantOverride, "id" | "createdAtMs" | "updatedAtMs">) => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await saveMerchantOverride(user.uid, draft);
      toast.success("Merchant correction saved");
      onSaved();
      onClose();
    } catch (error) {
      logError("merchantCorrection.save", error);
      toast.error(friendlyErrorMessage(error, "Could not save merchant correction"));
    } finally {
      setSaving(false);
    }
  };

  const namedDraft = (kind: MerchantOverride["kind"], refKey: string) => {
    const key = foldKey(name);
    const merchantId = aliasIndex.byAlias.get(key);
    return {
      kind,
      refKey,
      ...(merchantId ? { merchantId } : { customName: name.trim() }),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(subcategory.trim() ? { subcategory: subcategory.trim() } : {}),
    } satisfies Omit<MerchantOverride, "id" | "createdAtMs" | "updatedAtMs">;
  };

  const currentName = resolution.merchantId ? resolution.displayName : "No merchant confirmed";
  const canAlias = Boolean(resolution.normalized);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.colors.foreground }]}>Merchant correction</Text>
              <Text style={{ color: theme.colors.mutedForeground }} numberOfLines={2}>{source.text || "No source text"}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close merchant correction">
              <X size={22} color={theme.colors.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Card density="compact">
              <Text style={{ color: theme.colors.mutedForeground }}>Current recognition</Text>
              <Text style={[styles.current, { color: theme.colors.foreground }]}>{currentName}</Text>
              <Text style={{ color: theme.colors.mutedForeground }}>
                {resolution.confidence === "low" ? "This is only a suggestion." : resolution.method === "unresolved" ? "Not confidently recognised." : `Matched by ${resolution.matchedBy ?? resolution.method}.`}
              </Text>
            </Card>

            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>MERCHANT NAME OR REGISTRY ALIAS</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Search registry or type a name"
              placeholderTextColor={theme.colors.mutedForeground}
              style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border, backgroundColor: surfaces.tile }]}
              autoCapitalize="words"
            />

            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>CATEGORY</Text>
            <View style={{ minHeight: 300 }}>
              <CategoryPicker
                inline
                category={category}
                subcategory={subcategory}
                onCategoryChange={(nextCategory, nextSubcategory) => {
                  setCategory(nextCategory);
                  setSubcategory(nextSubcategory);
                }}
              />
            </View>

            <View style={styles.actions}>
              {onOpenProfile && resolution.merchantId ? (
                <Button variant="outline" onPress={onOpenProfile}>View merchant profile</Button>
              ) : null}
              {resolution.merchantId ? (
                <Button disabled={saving} onPress={() => void save({
                  ...namedDraft("transaction", source.refKey),
                })}>
                  <Check size={16} color={theme.colors.primaryForeground} /> Confirm / save merchant
                </Button>
              ) : null}
              <Button disabled={saving || !name.trim()} variant="outline" onPress={() => void save(namedDraft("transaction", source.refKey))}>
                Save correction
              </Button>
              {canAlias ? (
                <Button disabled={saving || !name.trim()} variant="outline" onPress={() => void save(namedDraft("alias", resolution.normalized))}>
                  Always use this for this variant
                </Button>
              ) : null}
              <Button disabled={saving} variant="ghost" onPress={() => void save({ kind: "transaction", refKey: source.refKey, rejected: true })}>
                Not this merchant
              </Button>
              {existingOverride ? (
                <Button disabled={saving} variant="ghost" onPress={async () => {
                  if (!user?.uid) return;
                  setSaving(true);
                  try {
                    await deleteMerchantOverride(user.uid, existingOverride.kind, existingOverride.refKey);
                    toast.success("Merchant correction reset");
                    onSaved();
                    onClose();
                  } catch (error) {
                    logError("merchantCorrection.reset", error);
                    toast.error(friendlyErrorMessage(error, "Could not reset merchant correction"));
                  } finally {
                    setSaving(false);
                  }
                }}>
                  <RotateCcw size={16} color={theme.colors.foreground} /> Reset correction
                </Button>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { height: "92%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  body: { padding: 16, gap: 12, paddingBottom: 36 },
  current: { fontSize: 18, fontWeight: "800", marginVertical: 4 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  actions: { gap: 10 },
});
