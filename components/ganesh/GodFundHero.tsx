import { Sparkles } from "lucide-react-native";

import { FundHero, type FundBreakdownItem } from "@/components/ganesh/ui/FundHero";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";

/**
 * The festival's headline number. One per screen — the Permanent Fund is a
 * quieter row elsewhere, so the two never compete for the same slot.
 */
export function GodFundHero({
  amount,
  festivalName,
  pandalName,
  breakdown,
  emptyHint,
  onPress,
}: {
  amount: number;
  festivalName?: string;
  pandalName?: string;
  breakdown?: FundBreakdownItem[];
  emptyHint?: string;
  onPress?: () => void;
}) {
  const g = useGaneshTokens();

  return (
    <FundHero
      kind="god"
      title={festivalName || "Ganesh Utsav"}
      subtitle={pandalName}
      icon={<Sparkles size={16} color={g.godFund} strokeWidth={2.2} />}
      eyebrow="Available God Fund"
      amount={amount}
      breakdown={breakdown}
      emptyHint={emptyHint}
      action={onPress ? { label: "Festival report", onPress } : undefined}
    />
  );
}
