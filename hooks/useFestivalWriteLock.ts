import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import {
  festivalDisplayStatus,
  festivalWriteLocked,
  type FestivalDisplayStatus,
} from "@/shared/utils/ganeshFestivalStatus";
import type { Festival } from "@/shared/types/ganesh";

export function useFestivalWriteLock(): {
  closed: boolean;
  displayStatus: FestivalDisplayStatus;
  festival: Festival | undefined;
} {
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  return {
    closed: festivalWriteLocked(festival?.status),
    displayStatus: festival ? festivalDisplayStatus(festival) : "active",
    festival,
  };
}
