/**
 * Local Transaction Inbox queue (pending Add / Ignore).
 * Never stores raw SMS bodies.
 */

import type { SmsReviewInboxItem } from "@/shared/types/smsTransaction";
import {
  mergeReviewInboxItems,
  removeReviewInboxItem,
} from "./smsReviewInbox";

const STORAGE_KEY = "vault_sms_review_inbox_v1";

let memoryItems: SmsReviewInboxItem[] | null = null;
let persistToDisk = true;

type InboxListener = (items: SmsReviewInboxItem[]) => void;
const listeners = new Set<InboxListener>();

function notify(items: SmsReviewInboxItem[]): void {
  for (const listener of listeners) {
    try {
      listener(items);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeSmsReviewInbox(listener: InboxListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

export async function loadSmsReviewInbox(): Promise<SmsReviewInboxItem[]> {
  if (memoryItems) return memoryItems;
  if (!persistToDisk) {
    memoryItems = [];
    return memoryItems;
  }
  try {
    const AsyncStorage = await getStorage();
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as SmsReviewInboxItem[]) : [];
    memoryItems = Array.isArray(list) ? list : [];
  } catch {
    memoryItems = [];
  }
  return memoryItems;
}

export async function saveSmsReviewInbox(
  items: SmsReviewInboxItem[]
): Promise<void> {
  memoryItems = items;
  notify(items);
  if (!persistToDisk) return;
  try {
    const AsyncStorage = await getStorage();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* keep in-memory only */
  }
}

export async function enqueueSmsReviewItems(
  incoming: SmsReviewInboxItem[]
): Promise<{ items: SmsReviewInboxItem[]; added: number }> {
  const current = await loadSmsReviewInbox();
  const merged = mergeReviewInboxItems(current, incoming);
  if (merged.added > 0) {
    await saveSmsReviewInbox(merged.items);
  }
  return merged;
}

export async function dismissSmsReviewItem(id: string): Promise<SmsReviewInboxItem[]> {
  const current = await loadSmsReviewInbox();
  const next = removeReviewInboxItem(current, id);
  if (next.length !== current.length) {
    await saveSmsReviewInbox(next);
  }
  return next;
}

export function resetSmsReviewInboxForTests(): void {
  persistToDisk = false;
  memoryItems = [];
  notify([]);
}
