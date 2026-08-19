import { useCallback, useEffect, useState } from "react";

import {
  acceptRecurringSuggestion,
  declineRecurringSuggestion,
} from "@/services/sms/smsRecurringSync";
import {
  loadRecurringSuggestions,
  subscribeRecurringSuggestions,
} from "@/services/sms/smsRecurringStore";
import type { RecurringPattern } from "@/services/sms/smsRecurringDetector";

export function useRecurringSuggestions() {
  const [items, setItems] = useState<RecurringPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadRecurringSuggestions().then((next) => {
      if (!cancelled) {
        setItems(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeRecurringSuggestions(setItems);
  }, []);

  const decline = useCallback(async (uid: string | undefined, pattern: RecurringPattern) => {
    setActingKey(pattern.key);
    try {
      await declineRecurringSuggestion(uid, pattern);
    } finally {
      setActingKey(null);
    }
  }, []);

  const accept = useCallback(async (patternKey: string) => {
    setActingKey(patternKey);
    try {
      await acceptRecurringSuggestion(patternKey);
    } finally {
      setActingKey(null);
    }
  }, []);

  return {
    items,
    count: items.length,
    loading,
    actingKey,
    decline,
    accept,
  };
}
