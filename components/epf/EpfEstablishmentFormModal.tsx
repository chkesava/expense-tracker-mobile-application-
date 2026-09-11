import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { EpfEstablishmentInput } from "@/hooks/useEpf";
import { appDialog } from "@/lib/appDialog";
import { epfEstablishmentFormSchema } from "@/shared/features/epf/schemas";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import { validateEstablishmentAgainstExisting } from "@/shared/features/epf/utils";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** The record being edited, or null when adding. */
  establishment: EpfEstablishment | null;
  /** Every establishment, used for the live overlap/current guard. */
  existing: EpfEstablishment[];
  onCreate: (input: EpfEstablishmentInput) => Promise<string | null>;
  onUpdate: (id: string, updates: Partial<EpfEstablishmentInput>) => Promise<boolean>;
  onArchive: (id: string) => Promise<boolean>;
  onRestore: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
};

export function EpfEstablishmentFormModal({
  isOpen,
  onClose,
  establishment,
  existing,
  onCreate,
  onUpdate,
  onArchive,
  onRestore,
  onDelete,
}: Props) {
  const { theme } = useTheme();

  const [employerName, setEmployerName] = useState("");
  const [establishmentNumber, setEstablishmentNumber] = useState("");
  const [memberId, setMemberId] = useState("");
  const [dateJoined, setDateJoined] = useState("");
  const [dateLeft, setDateLeft] = useState("");
  const [stillWorking, setStillWorking] = useState(true);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEmployerName(establishment?.employerName ?? "");
    setEstablishmentNumber(establishment?.establishmentNumber ?? "");
    setMemberId(establishment?.memberId ?? "");
    setDateJoined(establishment?.dateJoined ?? "");
    setDateLeft(establishment?.dateLeft ?? "");
    setStillWorking(establishment ? !establishment.dateLeft : true);
    setNotes(establishment?.notes ?? "");
    setErrors({});
  }, [isOpen, establishment]);

  /**
   * Live conflict preview so the user sees the problem before submitting,
   * using the same pure guard the hook enforces on write.
   */
  const conflict = useMemo(() => {
    if (!dateJoined) return null;
    const result = validateEstablishmentAgainstExisting(existing, {
      id: establishment?.id,
      dateJoined,
      dateLeft: stillWorking ? undefined : dateLeft || undefined,
    });
    return result.ok ? null : result.message;
  }, [existing, establishment?.id, dateJoined, dateLeft, stillWorking]);

  const handleSubmit = async () => {
    const effectiveDateLeft = stillWorking ? "" : dateLeft;
    const parsed = epfEstablishmentFormSchema.safeParse({
      employerName,
      establishmentNumber,
      memberId,
      dateJoined,
      dateLeft: effectiveDateLeft,
      notes,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0].toString()] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const payload: EpfEstablishmentInput = {
      employerName: parsed.data.employerName,
      establishmentNumber: parsed.data.establishmentNumber,
      memberId: parsed.data.memberId,
      dateJoined: parsed.data.dateJoined,
      dateLeft: parsed.data.dateLeft || undefined,
      notes: parsed.data.notes || undefined,
    };

    setSaving(true);
    const ok = establishment
      ? await onUpdate(establishment.id, payload)
      : Boolean(await onCreate(payload));
    setSaving(false);
    if (ok) onClose();
  };

  const runAction = async (action: (id: string) => Promise<boolean>) => {
    if (!establishment) return;
    setSaving(true);
    const ok = await action(establishment.id);
    setSaving(false);
    if (ok) onClose();
  };

  /**
   * Deleting is irreversible, so it is the one action that asks first. Archive
   * and restore stay single-tap: both are reversible and already confirmed by a
   * toast. Points at archiving, which is the intended path for anything with
   * history to keep.
   */
  const confirmDelete = () => {
    if (!establishment) return;
    appDialog.alert(
      "Delete establishment",
      `Permanently delete "${establishment.employerName}"? This cannot be undone. Archive it instead to keep its history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void runAction(onDelete);
          },
        },
      ]
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={establishment ? "Edit establishment" : "Add establishment"}
    >
      <View style={styles.form}>
        <Input
          label="Employer name *"
          value={employerName}
          onChangeText={setEmployerName}
          placeholder="Company name"
          error={errors.employerName}
          autoCapitalize="words"
        />

        <Input
          label="Establishment number *"
          value={establishmentNumber}
          onChangeText={setEstablishmentNumber}
          placeholder="e.g. MHBAN0012345000"
          error={errors.establishmentNumber}
          autoCapitalize="characters"
        />

        <Input
          label="PF member ID *"
          value={memberId}
          onChangeText={setMemberId}
          placeholder="Your PF account identifier"
          error={errors.memberId}
          autoCapitalize="characters"
        />

        <Input
          label="Date joined (YYYY-MM-DD) *"
          value={dateJoined}
          onChangeText={setDateJoined}
          placeholder="YYYY-MM-DD"
          error={errors.dateJoined}
          autoCapitalize="none"
        />

        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: theme.colors.foreground }]}>
            I still work here
          </Text>
          <Switch
            value={stillWorking}
            onValueChange={(value) => {
              setStillWorking(value);
              if (value) setDateLeft("");
            }}
          />
        </View>

        {stillWorking ? null : (
          <Input
            label="Date left (YYYY-MM-DD) *"
            value={dateLeft}
            onChangeText={setDateLeft}
            placeholder="YYYY-MM-DD"
            error={errors.dateLeft}
            autoCapitalize="none"
          />
        )}

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          error={errors.notes}
          multiline
        />

        {conflict ? (
          <Text style={[styles.conflict, { color: theme.colors.destructive }]}>{conflict}</Text>
        ) : null}

        <Button onPress={handleSubmit} loading={saving} disabled={Boolean(conflict)}>
          {establishment ? "Save changes" : "Add establishment"}
        </Button>

        {establishment ? (
          <>
            <Pressable
              onPress={() => runAction(establishment.archived ? onRestore : onArchive)}
              disabled={saving}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel={
                establishment.archived ? "Restore establishment" : "Archive establishment"
              }
            >
              {establishment.archived ? (
                <ArchiveRestore size={theme.iconSize.sm} color={theme.colors.foreground} />
              ) : (
                <Archive size={theme.iconSize.sm} color={theme.colors.foreground} />
              )}
              <Text style={[styles.actionText, { color: theme.colors.foreground }]}>
                {establishment.archived ? "Restore establishment" : "Archive establishment"}
              </Text>
            </Pressable>

            <Text style={[styles.actionHint, { color: theme.colors.mutedForeground }]}>
              Archiving hides this employer without deleting its history. Deleting is only possible
              while no contributions reference it.
            </Text>

            <Pressable
              onPress={confirmDelete}
              disabled={saving}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel="Delete establishment permanently"
            >
              <Trash2 size={theme.iconSize.sm} color={theme.colors.destructive} />
              <Text style={[styles.actionText, { color: theme.colors.destructive }]}>
                Delete permanently
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 16,
    paddingBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  conflict: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "500",
  },
  actionHint: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});
