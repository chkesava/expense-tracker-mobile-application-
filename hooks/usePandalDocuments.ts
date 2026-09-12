import { useMemo } from "react";
import { documentId, where } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import type { PandalDocument, PandalDocumentAudit } from "@/shared/types/ganesh";
import { pandalDocumentAuditsCol, pandalDocumentsCol } from "@/shared/utils/ganeshPaths";

export function usePandalDocuments(pandalId: string | null) {
  const { items, loading, error, pendingCount, retry } = useGaneshCollection<PandalDocument>(
    pandalId ? pandalDocumentsCol(pandalId) : null,
    (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<PandalDocument, "id">),
      pendingWrite,
    }),
    { orderByField: "updatedAt", orderDirection: "desc", limitTo: 400 }
  );
  return { documents: items, loading, error, pendingCount, retry };
}

export function usePandalDocument(pandalId: string | null, documentId: string | null) {
  const extra = useMemo(
    () => (documentId ? [where(documentId(), "==", documentId)] : []),
    [documentId]
  );
  const { items, loading, error } = useGaneshCollection<PandalDocument>(
    pandalId && documentId ? pandalDocumentsCol(pandalId) : null,
    (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<PandalDocument, "id">),
      pendingWrite,
    }),
    { extra, extraKey: `doc:${documentId ?? ""}`, limitTo: 1 }
  );
  return { document: items[0] ?? null, loading, error };
}

export function usePandalDocumentAuditsFor(pandalId: string | null, documentId: string | null) {
  const extra = useMemo(
    () => (documentId ? [where("documentId", "==", documentId)] : []),
    [documentId]
  );
  const { items, loading, error } = useGaneshCollection<PandalDocumentAudit>(
    pandalId && documentId ? pandalDocumentAuditsCol(pandalId) : null,
    (id, docData) => ({ id, ...(docData as Omit<PandalDocumentAudit, "id">) }),
    {
      extra,
      extraKey: documentId ?? "",
      orderByField: "at",
      orderDirection: "desc",
      limitTo: 200,
    }
  );
  return { audits: items, loading, error };
}
