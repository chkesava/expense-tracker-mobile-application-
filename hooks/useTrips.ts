import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { Trip } from "@/shared/types/trip";

export function useTrips(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setTrips([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "users", uid, "trips"),
      orderBy("startDate", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Trip[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Trip, "id">),
        }));
        setTrips(list);
        setLoading(false);
      },
      (error) => {
        console.error("useTrips error:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid, enabled]);

  const createTrip = async (
    tripData: Omit<Trip, "id" | "createdAt" | "userId" | "spentAmount">
  ): Promise<string | null> => {
    const db = getFirestoreDb();
    if (!uid || !db) return null;

    try {
      const docRef = doc(collection(db, "users", uid, "trips"));
      const outcome = await commitWrite(
        () =>
          setDoc(docRef, {
            ...tripData,
            userId: uid,
            spentAmount: 0,
            status: "active",
            createdAt: serverTimestamp(),
          }),
        { label: "trip" }
      );
      toast.success(writeSavedMessage(outcome, "Trip created!"));
      return docRef.id;
    } catch (err) {
      console.error("createTrip error:", err);
      toast.error("Failed to create trip");
      return null;
    }
  };

  const updateTrip = async (
    id: string,
    updates: Partial<Trip>
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const outcome = await commitWrite(
        () => updateDoc(doc(db, "users", uid, "trips", id), updates),
        { label: "trip" }
      );
      toast.success(writeSavedMessage(outcome, "Trip updated"));
      return true;
    } catch (err) {
      console.error("updateTrip error:", err);
      toast.error("Failed to update trip");
      return false;
    }
  };

  /**
   * Deletes a trip and unlinks all expenses associated with it.
   */
  const deleteTrip = async (tripId: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !tripId) return false;

    try {
      // Query all expenses linked to this trip
      const expensesQuery = query(
        collection(db, "users", uid, "expenses"),
        where("tripId", "==", tripId)
      );

      const { getDocs } = await import("firebase/firestore");
      const expensesSnap = await getDocs(expensesQuery);

      // Offline this answers from cache, which may not hold every linked
      // expense — the ones it misses would keep pointing at a deleted trip.
      if (expensesSnap.metadata.fromCache) {
        toast.error(
          "Can't verify linked expenses while offline. Try again when connected."
        );
        return false;
      }

      const batch = writeBatch(db);

      // Unlink each expense
      expensesSnap.docs.forEach((expDoc) => {
        batch.update(expDoc.ref, { tripId: null });
      });

      // Delete the trip itself
      batch.delete(doc(db, "users", uid, "trips", tripId));

      const outcome = await commitWrite(() => batch.commit(), {
        label: "trip deletion",
      });
      toast.success(
        writeSavedMessage(outcome, "Trip deleted and expenses unlinked")
      );
      return true;
    } catch (err) {
      console.error("deleteTrip error:", err);
      toast.error("Failed to delete trip");
      return false;
    }
  };

  /**
   * Links a single expense to a trip and updates the trip's spentAmount.
   */
  const linkExpenseToTrip = async (
    expenseId: string,
    tripId: string,
    expenseAmount: number
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db) return false;

    try {
      const trip = trips.find((t) => t.id === tripId);
      if (!trip) return false;

      const batch = writeBatch(db);
      batch.update(doc(db, "users", uid, "expenses", expenseId), { tripId });
      batch.update(doc(db, "users", uid, "trips", tripId), {
        spentAmount: (trip.spentAmount || 0) + expenseAmount,
      });

      await commitWrite(() => batch.commit(), { label: "trip link" });
      return true;
    } catch (err) {
      console.error("linkExpenseToTrip error:", err);
      return false;
    }
  };

  /**
   * Unlinks a single expense from its trip and decrements the trip's spentAmount.
   */
  const unlinkExpense = async (
    expenseId: string,
    tripId: string,
    expenseAmount: number
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db) return false;

    try {
      const trip = trips.find((t) => t.id === tripId);
      if (!trip) return false;

      const batch = writeBatch(db);
      batch.update(doc(db, "users", uid, "expenses", expenseId), {
        tripId: null,
      });
      batch.update(doc(db, "users", uid, "trips", tripId), {
        spentAmount: Math.max(0, (trip.spentAmount || 0) - expenseAmount),
      });

      await commitWrite(() => batch.commit(), { label: "trip unlink" });
      return true;
    } catch (err) {
      console.error("unlinkExpense error:", err);
      return false;
    }
  };

  const completeTrip = async (tripId: string): Promise<boolean> => {
    return updateTrip(tripId, { status: "completed" });
  };

  return {
    trips,
    loading,
    createTrip,
    updateTrip,
    deleteTrip,
    linkExpenseToTrip,
    unlinkExpense,
    completeTrip,
  };
}
