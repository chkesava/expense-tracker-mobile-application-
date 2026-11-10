import { useCallback, useState } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { shareDocumentFile } from "@/services/documents/documentViewerHelpers";
import {
  addTaxDocument,
  deleteTaxDocument,
  editTaxDocument,
  retryTaxDocumentUpload,
  taxDocumentUrl,
} from "@/services/tax/taxDocumentStore";
import type { FinancialYearKey, TaxDocument, TaxDocumentCategory } from "@/shared/features/tax/types";
import type { PickedTaxFile } from "@/shared/features/tax/utils/documents";

/**
 * Tax document actions (SPENDLY-298): add, retry an unfinished upload, edit,
 * delete and open. Results become plain toasts; an upload that couldn't finish
 * says so and stays in the list as "Upload unfinished".
 */
export function useTaxDocumentActions(fy: FinancialYearKey) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [busy, setBusy] = useState(false);

  const guard = useCallback(
    async <T,>(scope: string, fallback: string, work: (uid: string) => Promise<T>): Promise<T | null> => {
      if (!uid || busy) return null;
      setBusy(true);
      try {
        return await work(uid);
      } catch (err) {
        logError(scope, err);
        toast.error(friendlyErrorMessage(err, fallback));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, uid]
  );

  /** Resolves the new document's id once stored (or left pending), or null. */
  const add = useCallback(
    (input: { category: TaxDocumentCategory; name: string; note?: string; file: PickedTaxFile }) =>
      guard("tax.documents.add", "Couldn't store this document.", async (u) => {
        const result = await addTaxDocument(u, { fy, ...input });
        if (result.ok) toast.success("Document stored");
        else if (result.pending) toast.info(result.error);
        else toast.error(result.error);
        return result.ok || result.pending ? result.id ?? null : null;
      }),
    [fy, guard]
  );

  const retry = useCallback(
    (document: TaxDocument, file: PickedTaxFile) =>
      guard("tax.documents.retry", "Couldn't upload this document.", async (u) => {
        const result = await retryTaxDocumentUpload(u, document, file);
        if (result.ok) toast.success("Document stored");
        else toast.error(result.error);
        return result.ok;
      }),
    [guard]
  );

  const edit = useCallback(
    (document: TaxDocument, change: { name: string; note?: string; category: TaxDocumentCategory }) =>
      guard("tax.documents.edit", "Couldn't save the changes.", async (u) => {
        toast.success(writeSavedMessage(await editTaxDocument(u, document, change), "Document updated"));
        return true;
      }),
    [guard]
  );

  const remove = useCallback(
    (document: TaxDocument) =>
      guard("tax.documents.delete", "Couldn't delete this document.", async (u) => {
        const result = await deleteTaxDocument(u, document);
        if (result.ok) toast.success("Document deleted");
        else toast.error(result.error);
        return result.ok;
      }),
    [guard]
  );

  const open = useCallback(async (document: TaxDocument) => {
    try {
      const url = await taxDocumentUrl(document);
      await shareDocumentFile(url, document.mimeType, document.name);
    } catch (err) {
      logError("tax.documents.open", err);
      toast.error(friendlyErrorMessage(err, "Couldn't open this document."));
    }
  }, []);

  return { busy, add, retry, edit, remove, open };
}
