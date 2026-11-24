import { collection, getDocs, limit, orderBy, query } from "@/lib/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { InterestCreditEvent } from "@/shared/types/investment";

/**
 * Read-only history of fd-interest-daily's credits for one investment. A
 * one-shot read (not a listener) opened only when the detail modal is open,
 * same reasoning as `accountNotesStore`: most investments never have anyone
 * looking at this, so a session-long subscription would charge every user.
 */
export async function listInterestCredits(
  uid: string,
  investmentId: string,
  max = 10
): Promise<InterestCreditEvent[]> {
  const database = getFirestoreDb();
  if (!database) return [];
  const ref = collection(
    database,
    "users",
    uid,
    "investments",
    investmentId,
    "interestCredits"
  );
  const snap = await getDocs(query(ref, orderBy("date", "desc"), limit(max)));
  return snap.docs.map((d) => d.data() as InterestCreditEvent);
}
