import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { toast } from "@/lib/toast";
import type { GroupFund, GroupFundCadence, GroupFundMember, GroupFundPurpose } from "@/shared/types/groupFund";
import { groupFundIssueMessage } from "@/shared/utils/groupFundMessages";
import {
  cleanGroupFundText,
  parseGroupFundAmount,
  validateFundName,
  validateMembers,
  validatePurposes,
} from "@/shared/utils/groupFundModel";
import type { GroupFundConfigInput } from "@/shared/utils/groupFundWrites";
import { useTheme } from "@/theme/ThemeProvider";

type PurposeDraft = { id: string; name: string; cadence: GroupFundCadence; expected: string; archived: boolean; saved: boolean };
type MemberDraft = { id: string; name: string; archived: boolean; saved: boolean };

export type GroupFundFormSheetProps = {
  visible: boolean;
  /** Editing this fund; omitted to create one. */
  fund?: GroupFund | null;
  newKey: () => string;
  onClose: () => void;
  onSubmit: (input: GroupFundConfigInput) => Promise<boolean>;
};

const purposeDrafts = (fund?: GroupFund | null): PurposeDraft[] =>
  fund
    ? fund.purposes.map((p) => ({
        id: p.id,
        name: p.name,
        cadence: p.cadence,
        expected: p.expectedPerMember !== undefined ? String(p.expectedPerMember) : "",
        archived: Boolean(p.archived),
        saved: true,
      }))
    : [];

const memberDrafts = (fund?: GroupFund | null): MemberDraft[] =>
  fund ? fund.members.map((m) => ({ id: m.id, name: m.name, archived: Boolean(m.archived), saved: true })) : [];

/**
 * Create or edit a Group Fund (SPENDLY-687): its name, the purposes money is
 * collected for (with an optional expected amount per member), and the
 * members. Purposes and members that are already saved are archived, never
 * removed, because history points at them.
 */
export function GroupFundFormSheet({ visible, fund, newKey, onClose, onSubmit }: GroupFundFormSheetProps) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const editing = Boolean(fund);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [purposes, setPurposes] = useState<PurposeDraft[]>([]);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(fund?.name ?? "");
    setNotes(fund?.notes ?? "");
    const drafts = purposeDrafts(fund);
    setPurposes(drafts.length > 0 ? drafts : [{ id: newKey(), name: "", cadence: "monthly", expected: "", archived: false, saved: false }]);
    setMembers(memberDrafts(fund));
    // Reset only when the sheet opens or the fund changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fund?.id]);

  const label = [styles.label, { color: theme.colors.foreground }];
  const helper = [styles.helper, { color: theme.colors.mutedForeground }];

  const updatePurpose = (id: string, patch: Partial<PurposeDraft>) =>
    setPurposes((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const updateMember = (id: string, patch: Partial<MemberDraft>) =>
    setMembers((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const submit = async () => {
    const builtPurposes: GroupFundPurpose[] = [];
    for (const p of purposes) {
      if (!p.saved && !cleanGroupFundText(p.name)) continue; // an untouched new row
      const expected = p.expected.trim() ? parseGroupFundAmount(p.expected) : undefined;
      if (expected !== undefined && !(expected > 0)) {
        toast.error(`Enter a valid expected amount for ${p.name || "the purpose"}.`);
        return;
      }
      builtPurposes.push({
        id: p.id,
        name: p.name,
        cadence: p.cadence,
        ...(expected !== undefined ? { expectedPerMember: expected } : {}),
        ...(p.archived ? { archived: true } : {}),
      });
    }
    const builtMembers: GroupFundMember[] = members
      .filter((m) => m.saved || cleanGroupFundText(m.name))
      .map((m) => ({ id: m.id, name: m.name, ...(m.archived ? { archived: true } : {}) }));
    const issues = [...validateFundName(name), ...validatePurposes(builtPurposes), ...validateMembers(builtMembers)];
    if (issues.length > 0) {
      toast.error(groupFundIssueMessage(issues));
      return;
    }
    setBusy(true);
    try {
      const ok = await onSubmit({ name, notes, purposes: builtPurposes, members: builtMembers });
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      title={editing ? "Edit group fund" : "New group fund"}
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose }}
          primary={{ label: editing ? "Save" : "Create fund", onPress: submit, disabled: busy || !name.trim(), loading: busy }}
        />
      }
    >
      <View style={styles.body}>
        <View style={styles.group}>
          <Text style={label}>Name *</Text>
          <Input value={name} onChangeText={setName} placeholder="e.g. Dokra" accessibilityLabel="Fund name" />
        </View>

        <View style={styles.group}>
          <Text style={label}>Purposes *</Text>
          <Text style={helper}>
            What you collect for, e.g. a loan repayment or a festival. Each purpose keeps its own balance.
          </Text>
          {purposes.map((p) => (
            <View key={p.id} style={[styles.row, { borderColor: theme.colors.border, opacity: p.archived ? 0.6 : 1 }]}>
              <Input
                value={p.name}
                onChangeText={(v) => updatePurpose(p.id, { name: v })}
                placeholder="Purpose name"
                accessibilityLabel="Purpose name"
                editable={!p.archived}
              />
              <View style={styles.chips}>
                <Chip label="Monthly" selected={p.cadence === "monthly"} onPress={() => updatePurpose(p.id, { cadence: "monthly" })} />
                <Chip label="Ad hoc" selected={p.cadence === "adhoc"} onPress={() => updatePurpose(p.id, { cadence: "adhoc" })} />
                {p.saved ? (
                  <Chip
                    label={p.archived ? "Archived" : "Archive"}
                    selected={p.archived}
                    onPress={() => updatePurpose(p.id, { archived: !p.archived })}
                    accessibilityLabel={p.archived ? `Restore ${p.name}` : `Archive ${p.name}`}
                  />
                ) : purposes.length > 1 ? (
                  <Chip label="Remove" onPress={() => setPurposes((list) => list.filter((x) => x.id !== p.id))} />
                ) : null}
              </View>
              <Input
                leadingIcon={<CurrencyPrefix />}
                value={p.expected}
                onChangeText={(v) => updatePurpose(p.id, { expected: v })}
                placeholder={`Expected per member${p.cadence === "monthly" ? " each month" : ""} (optional)`}
                keyboardType="decimal-pad"
                accessibilityLabel={`Expected amount per member, ${currency}`}
              />
            </View>
          ))}
          <Button
            variant="outline"
            size="sm"
            onPress={() =>
              setPurposes((list) => [...list, { id: newKey(), name: "", cadence: "monthly", expected: "", archived: false, saved: false }])
            }
          >
            <Plus size={14} color={theme.colors.foreground} />
            <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>Add purpose</Text>
          </Button>
        </View>

        <View style={styles.group}>
          <Text style={label}>Members</Text>
          <Text style={helper}>The people who pay in. Add more any time.</Text>
          {members.map((m) => (
            <View key={m.id} style={[styles.memberRow, { opacity: m.archived ? 0.6 : 1 }]}>
              <View style={styles.flex}>
                <Input
                  value={m.name}
                  onChangeText={(v) => updateMember(m.id, { name: v })}
                  placeholder="Member name"
                  accessibilityLabel="Member name"
                  editable={!m.archived}
                />
              </View>
              {m.saved ? (
                <Chip
                  label={m.archived ? "Archived" : "Archive"}
                  selected={m.archived}
                  onPress={() => updateMember(m.id, { archived: !m.archived })}
                  accessibilityLabel={m.archived ? `Restore ${m.name}` : `Archive ${m.name}`}
                />
              ) : (
                <Chip label="Remove" onPress={() => setMembers((list) => list.filter((x) => x.id !== m.id))} />
              )}
            </View>
          ))}
          <Button
            variant="outline"
            size="sm"
            onPress={() => setMembers((list) => [...list, { id: newKey(), name: "", archived: false, saved: false }])}
          >
            <Plus size={14} color={theme.colors.foreground} />
            <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>Add member</Text>
          </Button>
        </View>

        <View style={styles.group}>
          <Text style={label}>Notes (optional)</Text>
          <Input value={notes} onChangeText={setNotes} placeholder="e.g. Collected on the 5th" accessibilityLabel="Notes" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingBottom: 8 },
  group: { gap: 8 },
  label: { fontSize: 12, fontWeight: "700" },
  helper: { fontSize: 11 },
  row: { gap: 8, padding: 10, borderWidth: 1, borderRadius: 12, borderCurve: "continuous" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
});
