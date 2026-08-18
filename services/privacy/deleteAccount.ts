import {
  EmailAuthProvider,
  GoogleAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";
import { logError } from "@/lib/errors";
import { clearLocalUserData } from "@/services/privacy/clearLocalUserData";
import {
  USER_NESTED_COLLECTIONS,
  USER_SUBCOLLECTIONS,
} from "@/services/privacy/userDataCollections";

const BATCH_LIMIT = 450;

export type ReauthInput =
  | { method: "password"; password: string }
  | { method: "google" };

async function commitDeletes(
  db: Firestore,
  refs: ReturnType<typeof doc>[]
): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

async function deleteCollectionPath(
  db: Firestore,
  segments: string[]
): Promise<void> {
  const snap = await getDocs(collection(db, segments.join("/")));
  await commitDeletes(
    db,
    snap.docs.map((item) => item.ref)
  );
}

async function wipeUserTree(db: Firestore, uid: string): Promise<void> {
  for (const nested of USER_NESTED_COLLECTIONS) {
    const parents = await getDocs(collection(db, "users", uid, nested.collection));
    for (const parent of parents.docs) {
      await deleteCollectionPath(db, [
        "users",
        uid,
        nested.collection,
        parent.id,
        nested.nested,
      ]);
      await deleteDoc(parent.ref);
    }
  }

  for (const name of USER_SUBCOLLECTIONS) {
    await deleteCollectionPath(db, ["users", uid, name]);
  }

  await deleteDoc(doc(db, "users", uid));
}

async function wipeSharedData(db: Firestore, uid: string): Promise<void> {
  const paymentSnap = await getDocs(
    query(collection(db, "paymentRequests"), where("createdBy", "==", uid))
  );
  await commitDeletes(
    db,
    paymentSnap.docs.map((item) => item.ref)
  );

  const vaultOwned = await getDocs(
    query(collection(db, "vaults"), where("ownerId", "==", uid))
  );
  for (const vault of vaultOwned.docs) {
    await deleteCollectionPath(db, ["vaults", vault.id, "expenses"]);
    await deleteDoc(vault.ref);
  }

  const vaultMember = await getDocs(
    query(collection(db, "vaults"), where("memberIds", "array-contains", uid))
  );
  for (const vault of vaultMember.docs) {
    if (vault.data().ownerId === uid) continue;
    await writeBatch(db)
      .update(vault.ref, { memberIds: arrayRemove(uid) })
      .commit();
  }

  const splitsCreated = await getDocs(
    query(collection(db, "splits"), where("createdBy", "==", uid))
  );
  await commitDeletes(
    db,
    splitsCreated.docs.map((item) => item.ref)
  );

  const splitsMember = await getDocs(
    query(collection(db, "splits"), where("participantIds", "array-contains", uid))
  );
  for (const split of splitsMember.docs) {
    if (split.data().createdBy === uid) continue;
    const participants = Array.isArray(split.data().participants)
      ? split.data().participants.filter(
          (person: { userId?: string }) => person.userId !== uid
        )
      : [];
    await writeBatch(db)
      .update(split.ref, {
        participantIds: arrayRemove(uid),
        participants,
      })
      .commit();
  }
}

export async function reauthenticateForDeletion(
  user: User,
  input: ReauthInput
): Promise<void> {
  if (input.method === "password") {
    const email = user.email;
    if (!email) throw new Error("This account has no email/password sign-in.");
    const credential = EmailAuthProvider.credential(email, input.password);
    await reauthenticateWithCredential(user, credential);
    return;
  }

  const { isSuccessResponse } = await import(
    "@react-native-google-signin/google-signin"
  );
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result) || !result.data.idToken) {
    throw new Error("Google did not return an ID token. Try again.");
  }
  const idToken = result.data.idToken;
  const credential = GoogleAuthProvider.credential(idToken);
  await reauthenticateWithCredential(user, credential);
}

/**
 * Erase cloud personal data, local SMS/chat caches, and the Firebase Auth user.
 * Caller must reauthenticate first (`reauthenticateForDeletion`).
 */
export async function deleteAccountAndData(user: User): Promise<void> {
  const db = getFirestoreDb();
  const auth = getFirebaseAuth();
  if (!db || !auth) throw new Error("Firebase is not configured.");

  const uid = user.uid;
  try {
    await wipeSharedData(db, uid);
    await wipeUserTree(db, uid);
    await wipeUserTree(db, `${uid}_duress`).catch(() => undefined);
    await clearLocalUserData(uid);
    await deleteUser(user);
  } catch (error) {
    logError("privacy.deleteAccount", error);
    throw error;
  }
}

export function accountHasPasswordProvider(user: User): boolean {
  return user.providerData.some((provider) => provider.providerId === "password");
}

export function accountHasGoogleProvider(user: User): boolean {
  return user.providerData.some((provider) => provider.providerId === "google.com");
}
