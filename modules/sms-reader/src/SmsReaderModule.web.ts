import { NativeModule, registerWebModule } from "expo";

import type { NativeSmsRow, OnSmsReceivedPayload } from "./SmsReader.types";

type SmsReaderEvents = {
  onSmsReceived: (event: OnSmsReceivedPayload) => void;
};

class SmsReaderModule extends NativeModule<SmsReaderEvents> {
  async readInbox(
    _limit: number,
    _minDateMs: number,
    _afterId: string | null
  ): Promise<NativeSmsRow[]> {
    return [];
  }

  async startListening(): Promise<boolean> {
    return false;
  }

  async stopListening(): Promise<boolean> {
    return false;
  }

  async isListening(): Promise<boolean> {
    return false;
  }
}

export default registerWebModule(SmsReaderModule, "SmsReader");
