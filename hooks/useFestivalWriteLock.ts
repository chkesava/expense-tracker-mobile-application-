import { useFestivals } from "@/hooks/useFestivals";
import { usePandals } from "@/hooks/usePandals";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import {
  ARCHIVED_PANDAL_WRITE_MESSAGE,
  CLOSED_FESTIVAL_WRITE_MESSAGE,
  festivalDisplayStatus,
  festivalWriteLocked,
  type FestivalDisplayStatus,
} from "@/shared/utils/ganeshFestivalStatus";
import type { Festival } from "@/shared/types/ganesh";

/**
 * Whether festival writes are locked, and why.
 *
 * Every Ganesh write screen already gates on `closed`, so archiving a Pandal is
 * folded in here rather than added to each screen: one place decides, and all
 * seven forms refuse with the right reason instead of letting the write reach
 * Firestore and come back a bare permission error (GS-017).
 *
 * `lockMessage` is the copy to show. Screens still importing
 * CLOSED_FESTIVAL_WRITE_MESSAGE directly keep blocking correctly, they just
 * name the wrong cause on an archived Pandal.
 */
export function useFestivalWriteLock(): {
  closed: boolean;
  displayStatus: FestivalDisplayStatus;
  festival: Festival | undefined;
  pandalArchived: boolean;
  lockMessage: string;
} {
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { pandals } = usePandals();
  const festival = festivals.find((item) => item.id === festivalId);
  const pandalArchived = pandals.find((item) => item.id === pandalId)?.archived === true;
  const festivalClosed = festivalWriteLocked(festival?.status);
  return {
    closed: festivalClosed || pandalArchived,
    displayStatus: festival ? festivalDisplayStatus(festival) : "active",
    festival,
    pandalArchived,
    // Archive is the broader statement, so it wins the wording when both hold.
    lockMessage: pandalArchived
      ? ARCHIVED_PANDAL_WRITE_MESSAGE
      : CLOSED_FESTIVAL_WRITE_MESSAGE,
  };
}
