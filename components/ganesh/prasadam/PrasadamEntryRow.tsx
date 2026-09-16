import { View } from "react-native";
import { UtensilsCrossed } from "lucide-react-native";

import { Avatar, LedgerRow } from "@/components/ganesh/ui";
import { useSessionTone } from "@/components/ganesh/prasadam/PrasadamSessionTone";
import type { PrasadamEntry } from "@/shared/types/ganeshPrasadam";
import {
  formatPrasadamQuantity,
  isPrasadamActive,
  prasadamTypeLabel,
} from "@/shared/utils/ganeshPrasadam";
import { formatSevaDate } from "@/shared/utils/ganeshSeva";

/**
 * One offering in the register.
 *
 * A `LedgerRow` with **no `amount`**: this feature carries no money, so the
 * right-hand column holds the quantity as plain text instead. That is the
 * difference between a register and a ledger, and it has to be visible.
 */
export function PrasadamEntryRow({
  entry,
  showDate = false,
  onPress,
}: {
  entry: PrasadamEntry;
  /** History rows leave their day, so they say which one they came from. */
  showDate?: boolean;
  onPress?: (id: string) => void;
}) {
  const tone = useSessionTone(entry.session);
  const active = isPrasadamActive(entry);

  const item = entry.prasadamLabel?.trim() || prasadamTypeLabel(entry.prasadamType);
  const quantity = formatPrasadamQuantity(entry.quantity, entry.unit, entry.unitLabel);

  const row = (
    <LedgerRow
      id={entry.id}
      icon={
        entry.providerId ? (
          <Avatar name={entry.providerName} />
        ) : (
          <UtensilsCrossed size={18} color={tone.accent} strokeWidth={2.2} />
        )
      }
      iconTint={entry.providerId ? "none" : tone.wash}
      title={entry.providerName}
      meta={[item, quantity].filter(Boolean).join(" · ")}
      // A normal row carries no badge. Badges are for the exception, and the
      // exception here is a cancellation.
      badges={active ? undefined : [{ kind: "cancelled", label: "Cancelled" }]}
      attribution={showDate ? tone.label : undefined}
      when={showDate ? formatSevaDate(entry.date) : undefined}
      pending={entry.pendingWrite}
      onPress={onPress}
    />
  );

  // Dimmed *and* worded: opacity alone is never the only signal that a row is
  // cancelled, which is why the badge above carries the text too.
  return active ? row : <View style={{ opacity: 0.6 }}>{row}</View>;
}
