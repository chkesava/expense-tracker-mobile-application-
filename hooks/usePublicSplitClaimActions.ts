/**
 * The only unauthenticated write in the app: a visitor on `/split/:slug`
 * telling the organizer they have paid, or that they will not contribute.
 *
 * `setDoc` on the derived id is a `create` the first time and an `update`
 * afterwards, and the rules only allow `create` — so a second attempt on the
 * same slot comes back as permission-denied. That is the intended behaviour,
 * not an error worth showing raw, so the copy is branched accordingly.
 */

import { useCallback, useState } from "react";
import { doc, setDoc } from "firebase/firestore";

import { isPermissionError, friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import type { SplitPublicShare } from "@/shared/types/splitPublicShare";
import type { SplitClaimType, SplitShareClaim } from "@/shared/types/splitShareClaim";
import { buildSplitClaimPayload } from "@/shared/utils/splitClaims";

export type UsePublicSplitClaimActions = {
  /** Participant key currently in flight, or null. */
  submitting: string | null;
  submitClaim: (params: {
    participantKey: string;
    type: SplitClaimType;
    amount: number;
    existing?: SplitShareClaim | null;
  }) => Promise<boolean>;
};

export function usePublicSplitClaimActions(
  share: SplitPublicShare | null
): UsePublicSplitClaimActions {
  const [submitting, setSubmitting] = useState<string | null>(null);

  const submitClaim = useCallback(
    async (params: {
      participantKey: string;
      type: SplitClaimType;
      amount: number;
      existing?: SplitShareClaim | null;
    }): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!db || !share) {
        toast.error("This split link isn't available right now.");
        return false;
      }

      const built = buildSplitClaimPayload({
        share,
        participantKey: params.participantKey,
        type: params.type,
        amount: params.amount,
        now: Date.now(),
        existing: params.existing,
      });
      if ("error" in built) {
        toast.error(built.error);
        return false;
      }

      setSubmitting(params.participantKey);
      try {
        await commitWrite(
          () => setDoc(doc(db, "splitShareClaims", built.docId), built.payload),
          {
            label: "update",
            onLateFailure: (err) => {
              // Offline the local cache accepts the create immediately, so the
              // pending chip appears at once. If the slot was already filled
              // server-side, the create fails once the queue drains.
              logError("splitClaims.submitLate", err, {
                type: params.type,
              });
              toast.error(
                "Your update couldn't be sent — the organizer may have already recorded it."
              );
            },
          }
        );
        toast.success("Sent to the organizer");
        return true;
      } catch (err) {
        logError("splitClaims.submit", err, { type: params.type });
        toast.error(
          isPermissionError(err)
            ? "You've already sent this, or the organizer has closed the link."
            : friendlyErrorMessage(err, "Couldn't send that. Try again.")
        );
        return false;
      } finally {
        setSubmitting(null);
      }
    },
    [share]
  );

  return { submitting, submitClaim };
}
