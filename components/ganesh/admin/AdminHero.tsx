import { type ReactNode } from "react";
import { Shield } from "lucide-react-native";

import { FestivalHero } from "@/components/ganesh/chrome/FestivalHero";
import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";

/**
 * Admin identity. Authoritative maroon chrome — live Pandal and festival.
 */
export function AdminHero({
  pandalName,
  festivalName,
  onBack,
  rightAccessory,
}: {
  pandalName?: string;
  festivalName?: string;
  onBack: () => void;
  rightAccessory?: ReactNode;
}) {
  return (
    <FestivalHero
      title="Admin"
      context={pandalName}
      subtitle={festivalName}
      onBack={onBack}
      rightAccessory={rightAccessory}
      showFestivalSwitcher
      mark={
        <GaneshIconTile onDark>
          <Shield size={22} color="#FFF8F1" strokeWidth={2} />
        </GaneshIconTile>
      }
    />
  );
}
