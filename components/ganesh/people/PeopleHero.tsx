import { type ReactNode } from "react";
import { Users } from "lucide-react-native";

import { FestivalHero } from "@/components/ganesh/chrome/FestivalHero";
import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";

/**
 * People identity. Shared maroon chrome, live festival name.
 */
export function PeopleHero({
  festivalName,
  rightAccessory,
}: {
  festivalName?: string;
  rightAccessory?: ReactNode;
}) {
  return (
    <FestivalHero
      title="People"
      subtitle={festivalName}
      rightAccessory={rightAccessory}
      mark={
        <GaneshIconTile onDark>
          <Users size={22} color="#FFF8F1" strokeWidth={2} />
        </GaneshIconTile>
      }
    />
  );
}
