export type NativeSmsRow = {
  id: string;
  address: string;
  body: string;
  /** Epoch ms (may arrive as number from Kotlin Double). */
  receivedAtMs: number;
  read?: boolean;
};
