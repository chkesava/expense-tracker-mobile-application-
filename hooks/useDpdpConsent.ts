import { useCallback, useMemo, useState } from "react";

import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import {
  acceptCurrentNotice,
  updateDpdpNominee,
  updateDpdpPurposes,
} from "@/services/privacy/consentStore";
import type { DpdpNominee, DpdpPurposes } from "@/shared/types/dpdp";
import {
  DEFAULT_DPDP_PURPOSES,
  EMPTY_DPDP_NOMINEE,
} from "@/shared/types/dpdp";
import {
  needsNoticeAcceptance,
  parseDpdpConsent,
} from "@/shared/utils/dpdpConsent";

export function useDpdpConsent() {
  const { realUser } = useAuth();
  const { data, loading, exists } = useUserDoc();
  const [saving, setSaving] = useState(false);

  const consent = useMemo(() => parseDpdpConsent(data), [data]);
  const purposes = consent?.purposes ?? DEFAULT_DPDP_PURPOSES;
  const nominee = consent?.nominee ?? EMPTY_DPDP_NOMINEE;
  const needsNotice = Boolean(realUser) && !loading && needsNoticeAcceptance(consent);

  const acceptNotice = useCallback(async () => {
    if (!realUser) throw new Error("Not signed in.");
    setSaving(true);
    try {
      return await acceptCurrentNotice(realUser.uid);
    } catch (error) {
      logError("dpdp.acceptNotice", error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [realUser]);

  const setPurposes = useCallback(
    async (patch: Partial<DpdpPurposes>) => {
      if (!realUser) throw new Error("Not signed in.");
      setSaving(true);
      try {
        return await updateDpdpPurposes(realUser.uid, patch);
      } catch (error) {
        logError("dpdp.updatePurposes", error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [realUser]
  );

  const setNominee = useCallback(
    async (patch: Partial<DpdpNominee>) => {
      if (!realUser) throw new Error("Not signed in.");
      setSaving(true);
      try {
        return await updateDpdpNominee(realUser.uid, patch);
      } catch (error) {
        logError("dpdp.updateNominee", error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [realUser]
  );

  return {
    consent,
    purposes,
    nominee,
    loading,
    exists,
    saving,
    needsNotice,
    acceptNotice,
    setPurposes,
    setNominee,
  };
}
