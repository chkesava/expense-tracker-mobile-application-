import { type ReactNode } from "react";

import { FestivalHero } from "@/components/ganesh/chrome/FestivalHero";
import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";
import { Ticket } from "lucide-react-native";

/**
 * Token Laddu identity. Shared maroon chrome, like every other Ganesh screen.
 *
 * A ticket rather than a sweet or a Ganesha: the screen's job is the numbered
 * token and the draw, and §10 of the UI contract keeps decorative religious
 * artwork out of ordinary UI icons.
 */
export function TokenLadduHero({
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
      title="Token Laddu"
      subtitle={festivalName}
      onBack={onBack}
      rightAccessory={rightAccessory}
      mark={
        <GaneshIconTile onDark>
          <Ticket size={22} color="#FFF8F1" strokeWidth={2} />
        </GaneshIconTile>
      }
    />
  );
}
