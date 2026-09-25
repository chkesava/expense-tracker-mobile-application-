import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NotebookPen, Pencil, Pin, PinOff, Trash2 } from "lucide-react-native";

import { accountAccent } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";
import type { AccountNote } from "@/shared/types/expense";
import { accountNoteSortMs } from "@/shared/utils/accountNotes";

const UPDATED_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function updatedLabel(note: AccountNote): string | undefined {
  const ms = accountNoteSortMs(note);
  if (!ms) return undefined;
  const edited =
    typeof note.updatedAtMs === "number" &&
    typeof note.createdAtMs === "number" &&
    note.updatedAtMs !== note.createdAtMs;
  return `${edited ? "Edited" : "Added"} ${UPDATED_FORMATTER.format(new Date(ms))}`;
}

/**
 * Account notes (SPENDLY-89).
 *
 * Sits below the financial cards on purpose. Notes are context, not a figure,
 * and placing them among the balances would invite reading them as one.
 */
export function AccountNotesCard({
  notes,
  loading,
  onAdd,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  notes: AccountNote[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (note: AccountNote) => void;
  onTogglePin: (note: AccountNote) => void;
  onDelete: (note: AccountNote) => void;
}) {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    if (notes.length === 0) return "Nothing noted yet";
    return `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
  }, [loading, notes.length]);

  const iconButton = (
    label: string,
    icon: ReactNode,
    onPress: () => void,
    destructive?: boolean
  ) => (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          borderColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
          backgroundColor: destructive
            ? "transparent"
            : surfaces.tile,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      {icon}
    </Pressable>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.title,
              {
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            Notes
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            {subtitle}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void haptic.selection();
            onAdd();
          }}
          accessibilityRole="button"
          accessibilityLabel="Add note"
          style={({ pressed }) => [
            styles.addBtn,
            { borderColor: accent, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text
            style={[
              styles.addLabel,
              { color: accent, fontFamily: theme.fontFamily.medium },
            ]}
          >
            Add note
          </Text>
        </Pressable>
      </View>

      {notes.length === 0 && !loading ? (
        <View style={styles.empty}>
          <NotebookPen size={22} color={theme.colors.mutedForeground} />
          <Text
            style={[
              styles.emptyTitle,
              {
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.medium,
              },
            ]}
          >
            No notes yet
          </Text>
          <Text style={[styles.emptyBody, { color: theme.colors.mutedForeground }]}>
            Keep the details that never fit a transaction — the branch, the
            relationship manager, why this account is open.
          </Text>
        </View>
      ) : null}

      {notes.map((note, index) => {
        const updated = updatedLabel(note);
        return (
          <View
            key={note.id}
            style={[
              styles.note,
              index > 0
                ? {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                    paddingTop: 12,
                  }
                : null,
            ]}
          >
            <View style={styles.noteText}>
              {note.title ? (
                <View style={styles.noteTitleRow}>
                  {note.pinned ? <Pin size={13} color={accent} /> : null}
                  <Text
                    style={[
                      styles.noteTitle,
                      {
                        color: theme.colors.foreground,
                        fontFamily: theme.fontFamily.medium,
                      },
                    ]}
                  >
                    {note.title}
                  </Text>
                </View>
              ) : null}

              {note.body ? (
                <Text
                  style={[styles.noteBody, { color: theme.colors.mutedForeground }]}
                >
                  {note.body}
                </Text>
              ) : null}

              {updated ? (
                <Text
                  style={[styles.noteMeta, { color: theme.colors.mutedForeground }]}
                >
                  {note.pinned && !note.title ? "Pinned · " : ""}
                  {updated}
                </Text>
              ) : null}
            </View>

            <View style={styles.noteActions}>
              {iconButton(
                note.pinned ? "Unpin note" : "Pin note",
                note.pinned ? (
                  <PinOff size={15} color={theme.colors.mutedForeground} />
                ) : (
                  <Pin size={15} color={theme.colors.mutedForeground} />
                ),
                () => onTogglePin(note)
              )}
              {iconButton(
                "Edit note",
                <Pencil size={15} color={theme.colors.mutedForeground} />,
                () => onEdit(note)
              )}
              {iconButton(
                "Delete note",
                <Trash2 size={15} color={theme.colors.destructive} />,
                () => onDelete(note),
                true
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: {
    flexShrink: 1,
  },
  title: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  addBtn: {
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addLabel: {
    fontSize: 13,
  },
  empty: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
  },
  emptyTitle: {
    fontSize: 14,
  },
  emptyBody: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
    maxWidth: 280,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  noteText: {
    flex: 1,
    gap: 4,
  },
  noteTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noteTitle: {
    fontSize: 14,
    flexShrink: 1,
  },
  noteBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  noteMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  noteActions: {
    flexDirection: "row",
    gap: 6,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
