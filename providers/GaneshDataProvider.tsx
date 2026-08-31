/**
 * One Firestore listener per Ganesh collection for the signed-in festival session.
 * Screens read this context instead of attaching their own onSnapshot watches.
 */

import {
  collection,
  doc,
  onSnapshot,
  where,
  type DocumentData,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { rememberGaneshRoleSeed } from "@/services/ganesh/ganeshHydrated";
import { assignPendingCollectionReceipts } from "@/services/ganesh/ganeshWrites";
import {
  EMPTY_GANESH_SUMMARY,
  EMPTY_PERMANENT_FUND,
  type Festival,
  type FestivalMember,
  type FestivalSeva,
  type GaneshActivity,
  type GaneshCategory,
  type GaneshCollection,
  type GaneshContribution,
  type GaneshExpense,
  type GaneshFestivalAudit,
  type GaneshReimbursement,
  type GaneshSponsorship,
  type GaneshSummary,
  type Household,
  type OpeningFund,
  type Pandal,
  type PandalAsset,
  type PandalAssetAudit,
  type PandalJoinRequest,
  type PandalMember,
  type PandalMemberAudit,
  type PandalMembershipIndex,
  type PandalRole,
  type PandalSponsor,
  type PandalSponsorAudit,
  type PermanentFundSummary,
  type PermanentFundTransaction,
} from "@/shared/types/ganesh";
import { parseGaneshSummary, parsePermanentFund } from "@/shared/utils/ganeshMath";
import {
  festivalCol,
  festivalsCol,
  pandalMembersCol,
  pandalRolesCol,
  pandalAssetAuditsCol,
  pandalAssetsCol,
  pandalMemberAuditsCol,
  pandalSponsorAuditsCol,
  pandalSponsorsCol,
  permanentFundDoc,
  permanentFundTransactionsCol,
  summaryDoc,
} from "@/shared/utils/ganeshPaths";

export type GaneshIdleSlice =
  | "assets"
  | "assetAudits"
  | "sponsors"
  | "sponsorAudits"
  | "sponsorships"
  | "permanentFund"
  | "permanentFundTx"
  | "festivalMembers"
  | "roles"
  | "openingFunds"
  | "reimbursements"
  | "auditLogs"
  | "memberAudits";

type Slice<T> = {
  items: T[];
  loading: boolean;
  error: LoadFailure | null;
  pendingCount: number;
  retry: () => void;
};

export type GaneshData = {
  pandals: Pandal[];
  pandalsLoading: boolean;
  pandalsError: LoadFailure | null;
  inactiveMemberships: PandalMembershipIndex[];
  festivals: Slice<Festival>;
  members: Slice<PandalMember>;
  summary: GaneshSummary;
  summaryLoading: boolean;
  summaryPendingWrite: boolean;
  summaryError: LoadFailure | null;
  retrySummary: () => void;
  contributions: Slice<GaneshContribution>;
  expenses: Slice<GaneshExpense>;
  collections: Slice<GaneshCollection>;
  activity: Slice<GaneshActivity>;
  seva: Slice<FestivalSeva>;
  households: Slice<Household>;
  categories: Slice<GaneshCategory>;
  joinRequests: Slice<PandalJoinRequest>;
  myJoinRequests: Slice<PandalJoinRequest>;
  assets: Slice<PandalAsset>;
  assetAudits: Slice<PandalAssetAudit>;
  sponsors: Slice<PandalSponsor>;
  sponsorAudits: Slice<PandalSponsorAudit>;
  sponsorships: Slice<GaneshSponsorship>;
  festivalMembers: Slice<FestivalMember>;
  roles: Slice<PandalRole>;
  openingFunds: Slice<OpeningFund>;
  reimbursements: Slice<GaneshReimbursement>;
  auditLogs: Slice<GaneshFestivalAudit>;
  memberAudits: Slice<PandalMemberAudit>;
  fund: PermanentFundSummary;
  fundLoading: boolean;
  fundTransactions: Slice<PermanentFundTransaction>;
  request: (slice: GaneshIdleSlice) => void;
  sessionPandalId: string | null;
  sessionFestivalId: string | null;
};

const GaneshDataContext = createContext<GaneshData | undefined>(undefined);

function mapDoc<T>(id: string, data: DocumentData, pendingWrite: boolean): T {
  return { id, ...(data as object), pendingWrite } as T;
}

function mapPlain<T>(id: string, data: DocumentData): T {
  return { id, ...(data as object) } as T;
}

function toSlice<T>(
  items: T[],
  loading: boolean,
  error: LoadFailure | null,
  pendingCount: number,
  retry: () => void
): Slice<T> {
  return { items, loading, error, pendingCount, retry };
}

export function GaneshDataProvider({ children }: { children: ReactNode }) {
  const { realUser } = useAuth();
  const uid = realUser?.uid ?? null;
  const { pandalId, festivalId } = useGaneshSession();
  const { isOnline } = useNetwork();
  const db = getFirestoreDb();
  const festivalReady = Boolean(pandalId && festivalId);

  const [idle, setIdle] = useState<Partial<Record<GaneshIdleSlice, true>>>({});
  const request = useCallback((slice: GaneshIdleSlice) => {
    setIdle((prev) => (prev[slice] ? prev : { ...prev, [slice]: true }));
  }, []);
  const wanted = (slice: GaneshIdleSlice) => Boolean(idle[slice]);
  const wantFund = wanted("permanentFund");
  const wantRoles = wanted("roles");

  useEffect(() => {
    if (!isOnline || !db || !pandalId || !festivalId) return;
    void assignPendingCollectionReceipts(db, pandalId, festivalId).catch(() => undefined);
  }, [isOnline, db, pandalId, festivalId]);

  const [pandals, setPandals] = useState<Pandal[]>([]);
  const [pandalsLoading, setPandalsLoading] = useState(true);
  const [pandalsError, setPandalsError] = useState<LoadFailure | null>(null);
  const [inactiveMemberships, setInactiveMemberships] = useState<PandalMembershipIndex[]>([]);

  useEffect(() => {
    if (!uid || !db) {
      setPandals([]);
      setInactiveMemberships([]);
      setPandalsLoading(false);
      return;
    }

    const membershipPath = `users/${uid}/pandalMemberships`;
    const pandalUnsubs = new Map<string, () => void>();
    const membershipsUnsub = onSnapshot(
      collection(db, "users", uid, "pandalMemberships"),
      (snapshot) => {
        logQuerySnapshot(membershipPath, snapshot);
        const activeIds = new Set<string>();
        const inactive: PandalMembershipIndex[] = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const status = data.status as PandalMembershipIndex["status"];
          const row: PandalMembershipIndex = {
            id: docSnap.id,
            pandalId: String(data.pandalId ?? docSnap.id),
            role: data.role,
            status,
            pandalName: typeof data.pandalName === "string" ? data.pandalName : undefined,
            joinedAt: data.joinedAt,
          };
          if (status == null || status === "active") {
            activeIds.add(docSnap.id);
          } else if (status === "removed" || status === "suspended") {
            inactive.push(row);
          }
        }
        setInactiveMemberships(inactive);
        for (const [id, unsub] of pandalUnsubs) {
          if (activeIds.has(id)) continue;
          forgetSnapshotPath(`pandals/${id}`);
          unsub();
          pandalUnsubs.delete(id);
          setPandals((prev) => prev.filter((item) => item.id !== id));
        }
        if (activeIds.size === 0) {
          setPandals([]);
          setPandalsError(null);
          setPandalsLoading(false);
          return;
        }
        for (const id of activeIds) {
          if (pandalUnsubs.has(id)) continue;
          const path = `pandals/${id}`;
          const unsub = onSnapshot(
            doc(db, "pandals", id),
            (pandalSnap) => {
              logQuerySnapshot(path, pandalSnap);
              if (!pandalSnap.exists()) {
                setPandals((prev) => prev.filter((item) => item.id !== id));
                setPandalsLoading(false);
                return;
              }
              const next: Pandal = {
                id: pandalSnap.id,
                ...(pandalSnap.data() as Omit<Pandal, "id">),
              };
              setPandals((prev) => {
                const others = prev.filter((item) => item.id !== next.id);
                return [...others, next];
              });
              setPandalsError(null);
              setPandalsLoading(false);
            },
            snapshotErrorHandler(
              "snapshot.ganesh.pandal",
              (failure) => {
                setPandalsError(failure);
                setPandalsLoading(false);
              },
              "Couldn't load this Pandal."
            )
          );
          pandalUnsubs.set(id, unsub);
        }
      },
      snapshotErrorHandler(
        "snapshot.ganesh.memberships",
        (failure) => {
          setPandalsError(failure);
          setPandalsLoading(false);
        },
        "Couldn't load your Pandals."
      )
    );

    return () => {
      forgetSnapshotPath(membershipPath);
      membershipsUnsub();
      for (const [id, unsub] of pandalUnsubs) {
        forgetSnapshotPath(`pandals/${id}`);
        unsub();
      }
    };
  }, [uid, db]);

  const festivalsColHook = useGaneshCollection<Festival>(
    pandalId ? festivalsCol(pandalId) : null,
    (id, data) => mapPlain<Festival>(id, data),
    { orderByField: "year", orderDirection: "desc" }
  );
  const membersColHook = useGaneshCollection<PandalMember>(
    pandalId ? pandalMembersCol(pandalId) : null,
    (id, data) => mapPlain<PandalMember>(id, data)
  );

  const [summary, setSummary] = useState<GaneshSummary>(EMPTY_GANESH_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryPendingWrite, setSummaryPendingWrite] = useState(false);
  const [summaryError, setSummaryError] = useState<LoadFailure | null>(null);
  const [summaryAttempt, setSummaryAttempt] = useState(0);

  useEffect(() => {
    if (!db || !pandalId || !festivalId) {
      setSummary(EMPTY_GANESH_SUMMARY);
      setSummaryLoading(false);
      setSummaryPendingWrite(false);
      return;
    }
    const path = summaryDoc(pandalId, festivalId).join("/");
    setSummary(EMPTY_GANESH_SUMMARY);
    setSummaryLoading(true);
    const [root, ...rest] = summaryDoc(pandalId, festivalId);
    const unsub = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        logQuerySnapshot(path, snap);
        setSummary(snap.exists() ? parseGaneshSummary(snap.data()) : EMPTY_GANESH_SUMMARY);
        setSummaryPendingWrite(snap.metadata.hasPendingWrites);
        setSummaryError(null);
        setSummaryLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.summary",
        (failure) => {
          setSummaryError(failure);
          setSummaryLoading(false);
        },
        "Couldn't load totals."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsub();
    };
  }, [db, pandalId, festivalId, summaryAttempt]);

  const contributions = useGaneshCollection<GaneshContribution>(
    festivalReady ? festivalCol(pandalId!, festivalId!, "contributions") : null,
    mapDoc,
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  const expenses = useGaneshCollection<GaneshExpense>(
    festivalReady ? festivalCol(pandalId!, festivalId!, "expenses") : null,
    mapDoc,
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  const collections = useGaneshCollection<GaneshCollection>(
    festivalReady ? festivalCol(pandalId!, festivalId!, "collections") : null,
    mapDoc,
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  const activity = useGaneshCollection<GaneshActivity>(
    festivalReady ? festivalCol(pandalId!, festivalId!, "activity") : null,
    mapDoc,
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 40 }
  );
  const seva = useGaneshCollection<FestivalSeva>(
    festivalReady ? festivalCol(pandalId!, festivalId!, "seva") : null,
    mapDoc,
    { orderByField: "date", orderDirection: "asc", limitTo: 400 }
  );
  const households = useGaneshCollection<Household>(
    festivalReady ? festivalCol(pandalId!, festivalId!, "households") : null,
    mapDoc
  );
  const categories = useGaneshCollection<GaneshCategory>(
    festivalReady ? festivalCol(pandalId!, festivalId!, "categories") : null,
    (id, data) => mapPlain<GaneshCategory>(id, data),
    { orderByField: "sortOrder", orderDirection: "asc" }
  );
  const joinRequests = useGaneshCollection<PandalJoinRequest>(
    pandalId ? ["pandalJoinRequests"] : null,
    (id, data) => mapPlain<PandalJoinRequest>(id, data),
    {
      extra: pandalId ? [where("pandalId", "==", pandalId)] : [],
      extraKey: pandalId ?? "",
    }
  );
  const myJoinRequests = useGaneshCollection<PandalJoinRequest>(
    uid ? ["pandalJoinRequests"] : null,
    (id, data) => mapPlain<PandalJoinRequest>(id, data),
    {
      extra: uid ? [where("userId", "==", uid)] : [],
      extraKey: uid ?? "",
      enabled: Boolean(uid),
    }
  );

  const assets = useGaneshCollection<PandalAsset>(
    wanted("assets") && pandalId ? pandalAssetsCol(pandalId) : null,
    mapDoc,
    { orderByField: "updatedAt", orderDirection: "desc", limitTo: 400 }
  );
  const assetAudits = useGaneshCollection<PandalAssetAudit>(
    wanted("assetAudits") && pandalId ? pandalAssetAuditsCol(pandalId) : null,
    (id, data) => mapPlain<PandalAssetAudit>(id, data),
    { orderByField: "at", orderDirection: "desc", limitTo: 80 }
  );
  const sponsors = useGaneshCollection<PandalSponsor>(
    wanted("sponsors") && pandalId ? pandalSponsorsCol(pandalId) : null,
    mapDoc,
    { orderByField: "updatedAt", orderDirection: "desc", limitTo: 400 }
  );
  const sponsorAudits = useGaneshCollection<PandalSponsorAudit>(
    wanted("sponsorAudits") && pandalId ? pandalSponsorAuditsCol(pandalId) : null,
    (id, data) => mapPlain<PandalSponsorAudit>(id, data),
    { orderByField: "at", orderDirection: "desc", limitTo: 80 }
  );
  const sponsorships = useGaneshCollection<GaneshSponsorship>(
    wanted("sponsorships") && festivalReady
      ? festivalCol(pandalId!, festivalId!, "sponsorships")
      : null,
    mapDoc,
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  const festivalMembers = useGaneshCollection<FestivalMember>(
    wanted("festivalMembers") && festivalReady
      ? festivalCol(pandalId!, festivalId!, "members")
      : null,
    (id, data) => mapPlain<FestivalMember>(id, data)
  );
  const roles = useGaneshCollection<PandalRole>(
    wanted("roles") && pandalId ? pandalRolesCol(pandalId) : null,
    (id, data) => mapPlain<PandalRole>(id, data)
  );
  const openingFunds = useGaneshCollection<OpeningFund>(
    wanted("openingFunds") && festivalReady
      ? festivalCol(pandalId!, festivalId!, "openingFunds")
      : null,
    mapDoc,
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 100 }
  );
  const reimbursements = useGaneshCollection<GaneshReimbursement>(
    wanted("reimbursements") && festivalReady
      ? festivalCol(pandalId!, festivalId!, "reimbursements")
      : null,
    mapDoc,
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 200 }
  );
  const auditLogs = useGaneshCollection<GaneshFestivalAudit>(
    wanted("auditLogs") && festivalReady
      ? festivalCol(pandalId!, festivalId!, "auditLogs")
      : null,
    (id, data) => mapPlain<GaneshFestivalAudit>(id, data),
    { orderByField: "at", orderDirection: "desc", limitTo: 80 }
  );
  const memberAudits = useGaneshCollection<PandalMemberAudit>(
    wanted("memberAudits") && pandalId ? pandalMemberAuditsCol(pandalId) : null,
    (id, data) => mapPlain<PandalMemberAudit>(id, data),
    { orderByField: "at", orderDirection: "desc", limitTo: 40 }
  );

  const [fund, setFund] = useState<PermanentFundSummary>(EMPTY_PERMANENT_FUND);
  const [fundKey, setFundKey] = useState("");
  const fundLoading = wantFund && fundKey !== (pandalId ?? "");

  useEffect(() => {
    if (!wantFund || !db || !pandalId) {
      if (!wantFund) {
        setFund(EMPTY_PERMANENT_FUND);
        setFundKey("");
      }
      return;
    }
    const path = permanentFundDoc(pandalId).join("/");
    const [root, ...rest] = permanentFundDoc(pandalId);
    const unsub = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        logQuerySnapshot(path, snap);
        setFund(snap.exists() ? parsePermanentFund(snap.data()) : EMPTY_PERMANENT_FUND);
        setFundKey(pandalId);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.permanentFund",
        () => setFundKey(pandalId),
        "Couldn't load Permanent Fund."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsub();
    };
  }, [wantFund, db, pandalId]);

  const fundTransactions = useGaneshCollection<PermanentFundTransaction>(
    wanted("permanentFundTx") && pandalId ? permanentFundTransactionsCol(pandalId) : null,
    mapDoc,
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 200 }
  );

  useEffect(() => {
    rememberGaneshRoleSeed(
      pandalId,
      wantRoles && !roles.loading ? roles.items : null,
      !membersColHook.loading ? membersColHook.items : null
    );
  }, [
    pandalId,
    wantRoles,
    roles.loading,
    roles.items,
    membersColHook.loading,
    membersColHook.items,
  ]);

  const value = useMemo<GaneshData>(
    () => ({
      pandals,
      pandalsLoading,
      pandalsError,
      inactiveMemberships,
      festivals: toSlice(
        festivalsColHook.items,
        festivalsColHook.loading,
        festivalsColHook.error,
        festivalsColHook.pendingCount,
        festivalsColHook.retry
      ),
      members: toSlice(
        membersColHook.items,
        membersColHook.loading,
        membersColHook.error,
        membersColHook.pendingCount,
        membersColHook.retry
      ),
      summary,
      summaryLoading,
      summaryPendingWrite,
      summaryError,
      retrySummary: () => setSummaryAttempt((n) => n + 1),
      contributions: toSlice(
        contributions.items,
        contributions.loading,
        contributions.error,
        contributions.pendingCount,
        contributions.retry
      ),
      expenses: toSlice(
        expenses.items,
        expenses.loading,
        expenses.error,
        expenses.pendingCount,
        expenses.retry
      ),
      collections: toSlice(
        collections.items,
        collections.loading,
        collections.error,
        collections.pendingCount,
        collections.retry
      ),
      activity: toSlice(
        activity.items,
        activity.loading,
        activity.error,
        activity.pendingCount,
        activity.retry
      ),
      seva: toSlice(seva.items, seva.loading, seva.error, seva.pendingCount, seva.retry),
      households: toSlice(
        households.items,
        households.loading,
        households.error,
        households.pendingCount,
        households.retry
      ),
      categories: toSlice(
        categories.items,
        categories.loading,
        categories.error,
        categories.pendingCount,
        categories.retry
      ),
      joinRequests: toSlice(
        joinRequests.items,
        joinRequests.loading,
        joinRequests.error,
        joinRequests.pendingCount,
        joinRequests.retry
      ),
      myJoinRequests: toSlice(
        myJoinRequests.items,
        myJoinRequests.loading,
        myJoinRequests.error,
        myJoinRequests.pendingCount,
        myJoinRequests.retry
      ),
      assets: toSlice(assets.items, assets.loading, assets.error, assets.pendingCount, assets.retry),
      assetAudits: toSlice(
        assetAudits.items,
        assetAudits.loading,
        assetAudits.error,
        assetAudits.pendingCount,
        assetAudits.retry
      ),
      sponsors: toSlice(
        sponsors.items,
        sponsors.loading,
        sponsors.error,
        sponsors.pendingCount,
        sponsors.retry
      ),
      sponsorAudits: toSlice(
        sponsorAudits.items,
        sponsorAudits.loading,
        sponsorAudits.error,
        sponsorAudits.pendingCount,
        sponsorAudits.retry
      ),
      sponsorships: toSlice(
        sponsorships.items,
        sponsorships.loading,
        sponsorships.error,
        sponsorships.pendingCount,
        sponsorships.retry
      ),
      festivalMembers: toSlice(
        festivalMembers.items,
        festivalMembers.loading,
        festivalMembers.error,
        festivalMembers.pendingCount,
        festivalMembers.retry
      ),
      roles: toSlice(roles.items, roles.loading, roles.error, roles.pendingCount, roles.retry),
      openingFunds: toSlice(
        openingFunds.items,
        openingFunds.loading,
        openingFunds.error,
        openingFunds.pendingCount,
        openingFunds.retry
      ),
      reimbursements: toSlice(
        reimbursements.items,
        reimbursements.loading,
        reimbursements.error,
        reimbursements.pendingCount,
        reimbursements.retry
      ),
      auditLogs: toSlice(
        auditLogs.items,
        auditLogs.loading,
        auditLogs.error,
        auditLogs.pendingCount,
        auditLogs.retry
      ),
      memberAudits: toSlice(
        memberAudits.items,
        memberAudits.loading,
        memberAudits.error,
        memberAudits.pendingCount,
        memberAudits.retry
      ),
      fund,
      fundLoading,
      fundTransactions: toSlice(
        fundTransactions.items,
        fundTransactions.loading,
        fundTransactions.error,
        fundTransactions.pendingCount,
        fundTransactions.retry
      ),
      request,
      sessionPandalId: pandalId,
      sessionFestivalId: festivalId,
    }),
    [
      pandals,
      pandalsLoading,
      pandalsError,
      inactiveMemberships,
      festivalsColHook,
      membersColHook,
      summary,
      summaryLoading,
      summaryPendingWrite,
      summaryError,
      contributions,
      expenses,
      collections,
      activity,
      seva,
      households,
      categories,
      joinRequests,
      myJoinRequests,
      assets,
      assetAudits,
      sponsors,
      sponsorAudits,
      sponsorships,
      festivalMembers,
      roles,
      openingFunds,
      reimbursements,
      auditLogs,
      memberAudits,
      fund,
      fundLoading,
      fundTransactions,
      request,
      pandalId,
      festivalId,
    ]
  );

  return <GaneshDataContext.Provider value={value}>{children}</GaneshDataContext.Provider>;
}

export function useGaneshData(): GaneshData {
  const context = useContext(GaneshDataContext);
  if (context === undefined) {
    throw new Error("useGaneshData must be used within a GaneshDataProvider");
  }
  return context;
}
