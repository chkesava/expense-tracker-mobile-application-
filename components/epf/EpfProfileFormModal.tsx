import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { epfProfileFormSchema, type EpfProfileFormInput } from "@/shared/features/epf/schemas";
import type { EpfProfile } from "@/shared/features/epf/types";
import { formatUan } from "@/shared/features/epf/utils";
import { fieldErrorsFromIssues } from "@/shared/utils/fieldErrors";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: EpfProfile | null;
  onSubmit: (input: EpfProfileFormInput) => Promise<boolean>;
};

export function EpfProfileFormModal({ isOpen, onClose, profile, onSubmit }: Props) {
  const [employeeName, setEmployeeName] = useState("");
  const [uan, setUan] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEmployeeName(profile?.employeeName ?? "");
    setUan(profile ? formatUan(profile.uan) : "");
    setNotes(profile?.notes ?? "");
    setErrors({});
  }, [isOpen, profile]);

  const handleSubmit = async () => {
    const parsed = epfProfileFormSchema.safeParse({ employeeName, uan, notes });

    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }

    setSaving(true);
    const ok = await onSubmit(parsed.data);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={profile ? "Edit EPF profile" : "Set up EPF"}>
      <View style={styles.form}>
        <Input
          label="Employee name *"
          value={employeeName}
          onChangeText={setEmployeeName}
          placeholder="Name as recorded with EPFO"
          error={errors.employeeName}
          autoCapitalize="words"
        />

        <Input
          label="UAN *"
          value={uan}
          onChangeText={setUan}
          placeholder="1234 5678 9012"
          error={errors.uan}
          helperText="12 digits. Spaces and hyphens are fine."
          keyboardType="number-pad"
          maxLength={14}
        />

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          error={errors.notes}
          multiline
        />

        <Button onPress={handleSubmit} loading={saving}>
          {profile ? "Save changes" : "Create EPF profile"}
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 16,
    paddingBottom: 12,
  },
});
