import { NativeModule, requireNativeModule } from "expo";

import type { NativeSmsRow } from "./SmsReader.types";

declare class SmsReaderModuleType extends NativeModule {
  /**
   * Query Android SMS inbox. Does not upload data.
   */
  readInbox(
    limit: number,
    minDateMs: number,
    afterId: string | null
  ): Promise<NativeSmsRow[]>;
}

export default requireNativeModule<SmsReaderModuleType>("SmsReader");
