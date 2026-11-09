/**
 * SPENDLY-739 (epic SPENDLY-735) — the Firestore write sentinels a pure op
 * builder needs. The app binds the client SDK's (`@/lib/firestore`); a server
 * job binds the Admin SDK's (`FieldValue.increment`, `FieldValue.serverTimestamp`).
 * One copy of the accounting logic, two SDKs.
 */
export type FieldValueSentinels = {
  increment(n: number): unknown;
  serverTimestamp(): unknown;
};
