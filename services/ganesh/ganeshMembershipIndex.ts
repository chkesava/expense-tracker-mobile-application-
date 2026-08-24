import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

import { logError } from "@/lib/errors";
import { commitWrite } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import { membershipDoc } from "@/shared/utils/ganeshPaths";

type MembershipIndexInput = {
  pandalId: string;
  role: string;
  status?: string;
  joinedAt?: unknown;
};

function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

export async function stampPandalMembershipIndex(
  db: Firestore,
  targetUserId: string,
  input: MembershipIndexInput
): Promise<void> {
  await commitWrite(
    () =>
      setDoc(
        pathRef(db, membershipDoc(targetUserId, input.pandalId)),
        omitUndefined({
          pandalId: input.pandalId,
          role: input.role,
          status: input.status ?? "active",
          joinedAt: input.joinedAt,
        }),
        { merge: true }
      ),
    { label: "membership index" }
  );
}

/** Stamps another person's index after the member doc is already saved. */
export async function tryStampPandalMembershipIndex(
  db: Firestore,
  targetUserId: string,
  input: MembershipIndexInput
): Promise<void> {
  try {
    await stampPandalMembershipIndex(db, targetUserId, input);
  } catch (error) {
    logError("ganesh.membershipIndex", error);
  }
}

/** Lets an approved member write their own index (owner rules always allow this). */
export async function claimOwnPandalMembership(
  db: Firestore,
  uid: string,
  pandalId: string
): Promise<void> {
  const memberSnap = await getDoc(doc(db, "pandals", pandalId, "members", uid));
  if (!memberSnap.exists()) return;
  const data = memberSnap.data();
  if (data.status != null && data.status !== "active") return;
  await stampPandalMembershipIndex(db, uid, {
    pandalId,
    role: String(data.role ?? "member"),
    status: String(data.status ?? "active"),
    joinedAt: data.createdAt,
  });
}
