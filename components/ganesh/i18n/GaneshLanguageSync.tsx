import { useEffect } from "react";

import { usePandals } from "@/hooks/usePandals";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import { useGaneshI18n } from "@/providers/GaneshI18nProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { coerceGaneshLanguage, isGaneshLanguage } from "@/shared/i18n/ganesh/types";

/**
 * Pushes the member's assigned language up into `GaneshI18nProvider`.
 *
 * Renders nothing. It exists because the two halves of the problem live at
 * different depths: the language of record is a field on
 * `pandals/{id}/members/{uid}`, only readable inside `GaneshDataProvider`,
 * while the provider that supplies `t()` has to sit above `PrivacyLock` so the
 * gates and spinners are translated too. Same shape as the sibling
 * `ClaimApprovedMemberships` in `app/(ganesh)/_layout.tsx`.
 *
 * It reuses the `members` slice `GaneshDataProvider` already subscribes to
 * rather than opening its own `onSnapshot`, so this adds **no** Firestore
 * reads, no new listener and no new failure mode.
 *
 * Resolution order: the member's own `language`, then the Pandal's
 * `defaultLanguage`, then English. Nothing is written at member-create time —
 * resolving at read time keeps the join and approval flows untouched, and means
 * changing the Pandal default retroactively moves every member who has no
 * explicit override, which is what an admin expects.
 */
export function GaneshLanguageSync() {
  // `realUser`, not `user` — under duress mode `user` is the decoy proxy, and
  // the decoy has no member document to read a language from (GS-045).
  const { realUser } = useAuth();
  const { pandalId } = useGaneshSession();
  const { members } = useGaneshData();
  const { pandals } = usePandals();
  const { setResolvedLanguage } = useGaneshI18n();

  const uid = realUser?.uid ?? null;
  const me = uid ? members.items.find((member) => member.userId === uid) : undefined;
  const pandal = pandalId ? pandals.find((item) => item.id === pandalId) : undefined;

  const assigned = me?.language;
  const pandalDefault = pandal?.defaultLanguage;

  useEffect(() => {
    // Wait for the member document rather than resolving from a half-loaded
    // slice — pushing English here would overwrite the cached value that is
    // already painting the correct language.
    if (!uid || members.loading) return;
    if (assigned === undefined && pandalDefault === undefined && members.items.length === 0) return;
    const resolved = isGaneshLanguage(assigned)
      ? assigned
      : coerceGaneshLanguage(pandalDefault);
    setResolvedLanguage(resolved);
  }, [uid, members.loading, members.items.length, assigned, pandalDefault, setResolvedLanguage]);

  return null;
}
