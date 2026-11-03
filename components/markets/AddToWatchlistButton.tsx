import { useState } from "react";
import { BookmarkPlus } from "lucide-react-native";
import { Text } from "react-native";

import { Button } from "@/components/ui/Button";
import { appDialog } from "@/lib/appDialog";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { addToWatchlistById, prepareWatchlistChoices } from "@/services/portfolio/watchlistStore";
import type { Watchlist } from "@/shared/types/watchlist";
import { displaySymbol } from "@/shared/utils/watchlists";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * "Add to watchlist" on the Markets and Screener stock sheet (SPENDLY-624,
 * story SPENDLY-658). No listener: on tap it reads the lists once, asks which
 * one when there are several, then adds through the watchlist store. Never
 * touches holdings.
 */
export function AddToWatchlistButton({ symbol, name }: { symbol: string; name: string }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const uid = user?.uid;
  const [busy, setBusy] = useState(false);

  const addTo = async (list: Watchlist) => {
    if (!uid) return;
    setBusy(true);
    try {
      const r = await addToWatchlistById(uid, list.id, { symbol, name });
      if (!r.ok) toast.error(r.message);
      else if (r.status === "exists") toast.info(`${displaySymbol(symbol)} is already in ${list.name}`);
      else {
        void haptic.success();
        toast.success(`Added to ${list.name}`);
      }
    } catch (error) {
      logError("watchlists.addFromSheet", error);
      toast.error(friendlyErrorMessage(error, "Couldn't add to your watchlist."));
    } finally {
      setBusy(false);
    }
  };

  const onPress = async () => {
    if (!uid || busy) return;
    setBusy(true);
    let lists: Watchlist[] = [];
    try {
      const r = await prepareWatchlistChoices(uid);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      lists = r.lists;
    } catch (error) {
      logError("watchlists.prepareChoices", error);
      toast.error(friendlyErrorMessage(error, "Couldn't load your watchlists."));
      return;
    } finally {
      setBusy(false);
    }
    if (lists.length === 1) {
      void addTo(lists[0]);
      return;
    }
    appDialog.actionMenu(
      `Add ${displaySymbol(symbol)} to`,
      lists.map((l) => ({ text: l.name, onPress: () => void addTo(l) }))
    );
  };

  if (!uid) return null;
  return (
    <Button variant="outline" size="sm" onPress={onPress} loading={busy} accessibilityLabel={`Add ${displaySymbol(symbol)} to a watchlist`}>
      <BookmarkPlus size={16} color={theme.colors.primary} />
      <Text style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }}>Add to watchlist</Text>
    </Button>
  );
}
