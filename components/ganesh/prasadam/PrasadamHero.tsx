import { type ReactNode } from "react";
import { UtensilsCrossed } from "lucide-react-native";

import { FestivalHero } from "@/components/ganesh/chrome/FestivalHero";
import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";

/**
 * Prasadam identity. The shared maroon chrome every Ganesh screen wears.
 *
 * A serving glyph rather than a deity: §10 keeps decorative religious artwork
 * out of ordinary UI icons, and the screen's job is the register, not the
 * offering itself. `FestivalHero` already carries the festival decoration at
 * the weight the design system allows, so nothing is added on top of it.
 */
export function PrasadamHero({
  festivalName,
  rightAccessory,
  onBack,
}: {
  festivalName?: string;
  rightAccessory?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <FestivalHero
      title="Prasadam"
      subtitle={festivalName}
      onBack={onBack}
      rightAccessory={rightAccessory}
      mark={
        <GaneshIconTile onDark>
          <UtensilsCrossed size={22} color="#FFF8F1" strokeWidth={2} />
        </GaneshIconTile>
      }
    />
  );
}
