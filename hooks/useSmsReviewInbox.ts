import { useCallback, useEffect, useState } from "react";

import {
  addSmsReviewItem,
  ignoreSmsReviewItem,
} from "@/services/sms/smsReviewActions";
import {
  loadSmsReviewInbox,
  subscribeSmsReviewInbox,
} from "@/services/sms/smsReviewInboxStore";
import type { SmsReviewInboxItem } from "@/shared/types/smsTransaction";

export function useSmsReviewInbox() {
  const [items, setItems] = useState<SmsReviewInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSmsReviewInbox().then((next) => {
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
    return subscribeSmsReviewInbox(setItems);
  }, []);

  const addItem = useCallback(async (id: string, uid: string) => {
    setActingId(id);
    try {
      await addSmsReviewItem(id, uid);
    } finally {
      setActingId(null);
    }
  }, []);

  const ignoreItem = useCallback(async (id: string) => {
    setActingId(id);
    try {
      await ignoreSmsReviewItem(id);
    } finally {
      setActingId(null);
    }
  }, []);

  return {
    items,
    count: items.length,
    loading,
    actingId,
    addItem,
    ignoreItem,
  };
}
