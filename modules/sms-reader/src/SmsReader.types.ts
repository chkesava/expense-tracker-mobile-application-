export type NativeSmsRow = {
  id: string;
  smsId?: string;
  address: string;
  sender?: string;
  body: string;
  /** Epoch ms (may arrive as number from Kotlin Double). */
  receivedAtMs: number;
  timestamp?: number;
  read?: boolean;
};

export type OnSmsReceivedPayload = {
  messages: NativeSmsRow[];
};
