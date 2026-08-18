import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

import { redactSensitiveUserFields } from "@/shared/utils/dpdpConsent";
import {
  USER_NESTED_COLLECTIONS,
  USER_SUBCOLLECTIONS,
} from "@/services/privacy/userDataCollections";

export type PersonalDataExport = {
  exportedAt: string;
  uid: string;
  profile: Record<string, unknown>;
  collections: Record<string, unknown[]>;
  shared: {
    paymentRequests: unknown[];
    vaults: unknown[];
    splits: unknown[];
  };
};

async function docsIn(
  db: Firestore,
  segments: string[]
): Promise<Array<Record<string, unknown>>> {
  const snap = await getDocs(collection(db, segments.join("/")));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function mapDocs(snap: { docs: Array<{ id: string; data: () => object }> }) {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of snap.docs) {
    map.set(item.id, { id: item.id, ...item.data() });
  }
  return map;
}

/**
 * Assemble a JSON access package for the Data Principal (DPDP s.11).
 * PIN hashes are omitted.
 */
export async function buildPersonalDataExport(
  db: Firestore,
  uid: string
): Promise<PersonalDataExport> {
  const userSnap = await getDoc(doc(db, "users", uid));
  const profile = redactSensitiveUserFields(
    userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {}
  );

  const collections: Record<string, unknown[]> = {};
  for (const name of USER_SUBCOLLECTIONS) {
    collections[name] = await docsIn(db, ["users", uid, name]);
  }

  for (const nested of USER_NESTED_COLLECTIONS) {
    const parents = await docsIn(db, ["users", uid, nested.collection]);
    const withChildren = [];
    for (const parent of parents) {
      const parentId = String(parent.id);
      const children = await docsIn(db, [
        "users",
        uid,
        nested.collection,
        parentId,
        nested.nested,
      ]);
      withChildren.push({ ...parent, [nested.nested]: children });
    }
    collections[nested.collection] = withChildren;
  }

  const [paymentRequests, vaultsOwned, vaultsMember, splitsCreated, splitsMember] =
    await Promise.all([
      getDocs(query(collection(db, "paymentRequests"), where("createdBy", "==", uid))),
      getDocs(query(collection(db, "vaults"), where("ownerId", "==", uid))),
      getDocs(query(collection(db, "vaults"), where("memberIds", "array-contains", uid))),
      getDocs(query(collection(db, "splits"), where("createdBy", "==", uid))),
      getDocs(
        query(collection(db, "splits"), where("participantIds", "array-contains", uid))
      ),
    ]);

  const vaultMap = mapDocs(vaultsOwned);
  for (const [id, value] of mapDocs(vaultsMember)) vaultMap.set(id, value);
  const splitMap = mapDocs(splitsCreated);
  for (const [id, value] of mapDocs(splitsMember)) splitMap.set(id, value);

  return {
    exportedAt: new Date().toISOString(),
    uid,
    profile,
    collections,
    shared: {
      paymentRequests: paymentRequests.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      })),
      vaults: [...vaultMap.values()],
      splits: [...splitMap.values()],
    },
  };
}
