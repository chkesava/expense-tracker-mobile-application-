import { NativeModule, registerWebModule } from "expo";

import type { NativeSmsRow } from "./SmsReader.types";

class SmsReaderModule extends NativeModule {
  async readInbox(
    _limit: number,
    _minDateMs: number,
    _afterId: string | null
  ): Promise<NativeSmsRow[]> {
    return [];
  }
}

export default registerWebModule(SmsReaderModule, "SmsReader");
