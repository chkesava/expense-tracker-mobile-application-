import { StyleSheet, View } from "react-native";

import { Modal } from "@/components/common";
import { LEDGER_SECTION_ICONS } from "@/components/ledger/ledgerSectionIcons";
import {
  SettingsGroupLabel,
  SettingsHubRow,
} from "@/components/settings/SettingsHubRow";
import {
  LEDGER_GROUPS,
  LEDGER_SECTIONS,
  type LedgerHubTabId,
} from "@/shared/config/navigation";

/**
 * The Money hub's complete, grouped index (SPENDLY-137).
 *
 * The tab row can only ever show what fits; this is the surface that answers
 * "what else is in here", and the grouping is what distinguishes an account
 * from a debt rather than listing seven equal-looking destinations.
 */
export function AllSectionsSheet({
  isOpen,
  onClose,
  section,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  section: LedgerHubTabId;
  onSelect: (section: LedgerHubTabId) => void;
}) {
  const handleSelect = (next: LedgerHubTabId) => {
    onClose();
    // Defer so the switch doesn't race the dismiss animation.
    const defer =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb: () => void) => setTimeout(cb, 0);
    defer(() => {
      onSelect(next);
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="All sections" maxHeight="70%">
      <View style={styles.groups}>
        {LEDGER_GROUPS.map((group) => {
          const sections = LEDGER_SECTIONS.filter(
            (entry) => entry.group === group.id
          );
          if (sections.length === 0) return null;
          return (
            <View key={group.id} style={styles.group}>
              <SettingsGroupLabel label={group.label} />
              <View style={styles.groupList}>
                {sections.map((entry) => (
                  <SettingsHubRow
                    key={entry.id}
                    title={entry.title}
                    subtitle={entry.subtitle}
                    icon={LEDGER_SECTION_ICONS[entry.id]}
                    selected={entry.id === section}
                    onPress={() => handleSelect(entry.id)}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  groups: {
    gap: 16,
    paddingBottom: 8,
  },
  group: {
    gap: 8,
  },
  groupList: {
    gap: 8,
  },
});
