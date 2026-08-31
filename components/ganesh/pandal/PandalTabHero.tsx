import { type ReactNode } from "react";
import { Landmark } from "lucide-react-native";

import { FestivalHero } from "@/components/ganesh/chrome/FestivalHero";
import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";

/**
 * Pandal chrome. Same family as the other tabs — a small flag is the only
 * extra ornament, and there is no overlapping medallion.
 */
export function PandalTabHero({
  festivalName,
  rightAccessory,
}: {
  festivalName?: string;
  rightAccessory?: ReactNode;
}) {
  return (
    <FestivalHero
      title="Pandal"
      subtitle={festivalName}
      rightAccessory={rightAccessory}
      showFlag
      showFestivalSwitcher
      mark={
        <GaneshIconTile onDark>
          <Landmark size={22} color="#FFF8F1" strokeWidth={2} />
        </GaneshIconTile>
      }
    />
  );
}
