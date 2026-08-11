import { NativeModule, requireNativeModule } from "expo";

import type { NativeSmsRow, OnSmsReceivedPayload } from "./SmsReader.types";

type SmsReaderEvents = {
  onSmsReceived: (event: OnSmsReceivedPayload) => void;
};

declare class SmsReaderModuleType extends NativeModule<SmsReaderEvents> {
  readInbox(
    limit: number,
    minDateMs: number,
    afterId: string | null
  ): Promise<NativeSmsRow[]>;
  /** Runtime BroadcastReceiver for SMS_RECEIVED. */
  startListening(): Promise<boolean>;
  stopListening(): Promise<boolean>;
  isListening(): Promise<boolean>;
}

export default requireNativeModule<SmsReaderModuleType>("SmsReader");
