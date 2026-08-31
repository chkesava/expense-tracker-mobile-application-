import { type ReactNode } from "react";
import { IndianRupee } from "lucide-react-native";

import { FestivalHero } from "@/components/ganesh/chrome/FestivalHero";
import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";

/**
 * Funds identity. Shared maroon chrome. No date strip — money stays the point.
 */
export function PandalNidhiHero({
  festivalName,
  rightAccessory,
}: {
  festivalName?: string;
  rightAccessory?: ReactNode;
}) {
  return (
    <FestivalHero
      title="Pandal Nidhi"
      subtitle={festivalName}
      rightAccessory={rightAccessory}
      showFestivalSwitcher
      mark={
        <GaneshIconTile onDark>
          <IndianRupee size={22} color="#FFF8F1" strokeWidth={2} />
        </GaneshIconTile>
      }
    />
  );
}
