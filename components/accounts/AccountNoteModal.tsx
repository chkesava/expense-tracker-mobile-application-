import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pin } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { accountAccent } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";
import type { AccountNote } from "@/shared/types/expense";
import {
  ACCOUNT_NOTE_BODY_MAX,
  ACCOUNT_NOTE_TITLE_MAX,
  accountNoteDraftChanged,
  createEmptyAccountNoteDraft,
  isAccountNoteDraftValid,
  normalizeAccountNoteDraft,
  type AccountNoteDraft,
} from "@/shared/utils/accountNotes";

/**
 * Write or edit one account note.
 *
 * Both fields are optional individually because the two real uses pull in
 * opposite directions — a labelled fact ("Branch: Indiranagar") and an
 * unlabelled paragraph — and forcing a heading onto the second turns a jot
 * into a form.
 */
export function AccountNoteModal({
  isOpen,
  note,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  /** The note being edited, or undefined when writing a new one. */
  note?: AccountNote;
  onClose: () => void;
  onSave: (draft: AccountNoteDraft) => Promise<void>;
}) {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const [draft, setDraft] = useState<AccountNoteDraft>(createEmptyAccountNoteDraft);
  const [saving, setSaving] = useState(false);

  // Reset on every open so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(
      note
        ? {
            title: note.title ?? "",
            body: note.body ?? "",
            pinned: note.pinned === true,
          }
        : createEmptyAccountNoteDraft()
    );
    setSaving(false);
  }, [isOpen, note]);

  const canSave = useMemo(() => {
    if (!isAccountNoteDraftValid(draft)) return false;
    if (!note) return true;
    return accountNoteDraftChanged(note, draft);
  }, [draft, note]);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave(normalizeAccountNoteDraft(draft));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={note ? "Edit note" : "Add note"}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Input
          label="Title"
          placeholder="Optional"
          value={draft.title}
          onChangeText={(title) => setDraft((prev) => ({ ...prev, title }))}
          maxLength={ACCOUNT_NOTE_TITLE_MAX}
          autoCapitalize="sentences"
        />

        <Input
          label="Note"
          placeholder="Anything worth remembering about this account"
          value={draft.body}
          onChangeText={(body) => setDraft((prev) => ({ ...prev, body }))}
          maxLength={ACCOUNT_NOTE_BODY_MAX}
          multiline
          numberOfLines={5}
          autoCapitalize="sentences"
          style={styles.bodyInput}
          helperText={`${draft.body.length}/${ACCOUNT_NOTE_BODY_MAX}`}
        />

        <Pressable
          onPress={() => {
            void haptic.selection();
            setDraft((prev) => ({ ...prev, pinned: !prev.pinned }));
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.pinned }}
          accessibilityLabel="Pin this note to the top"
          style={[
            styles.pinRow,
            {
              backgroundColor: draft.pinned
                ? `${accent}1A`
                : surfaces.tile,
              borderColor: draft.pinned
                ? accent
                : isDark
                  ? "rgba(148,163,184,0.16)"
                  : "rgba(15,23,42,0.08)",
            },
          ]}
        >
          <Pin
            size={16}
            color={draft.pinned ? accent : theme.colors.mutedForeground}
          />
          <Text
            style={[
              styles.pinLabel,
              {
                color: draft.pinned ? accent : theme.colors.foreground,
                fontFamily: theme.fontFamily.medium,
              },
            ]}
          >
            Pin to top
          </Text>
        </Pressable>

        <View style={styles.actions}>
          <Button variant="ghost" onPress={onClose} style={styles.action}>
            Cancel
          </Button>
          <Button
            onPress={() => {
              void handleSave();
            }}
            disabled={!canSave}
            loading={saving}
            style={styles.action}
          >
            {note ? "Save" : "Add note"}
          </Button>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 8,
  },
  bodyInput: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pinLabel: {
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  action: {
    flex: 1,
  },
});
